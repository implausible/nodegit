NAN_METHOD(GitRepository::GetReferencesFromList)
{
  if (info.Length() == 0 || !info[0]->IsArray()) {
    return Nan::ThrowError("A list of references to lookup must be provided.");
  }


  v8::Local<v8::Array> reference_list = v8::Local<v8::Array>::Cast(info[0]->ToObject());
  for (uint32_t reference_list_index = 0; reference_list_index < reference_list->Length(); ++reference_list_index) {
    if (!reference_list->Get(reference_list_index)->IsString()) {
      return Nan::ThrowError("A list of references to lookup must be provided.");
    }
  }

  if (info.Length() == 1 || !info[1]->IsFunction()) {
    return Nan::ThrowError("Callback is required and must be a Function.");
  }

  GetReferencesFromListBaton* baton = new GetReferencesFromListBaton;

  baton->error_code = GIT_OK;
  baton->error = NULL;
  baton->out = new std::vector<git_reference *>;
  baton->ref_list = new std::vector<const char *>;
  baton->repo = Nan::ObjectWrap::Unwrap<GitRepository>(info.This())->GetValue();

  for (uint32_t reference_list_index = 0; reference_list_index < reference_list->Length(); ++reference_list_index) {
    String::Utf8Value reference_shorthand(reference_list->Get(reference_list_index)->ToString());
    const char *from_reference_shorthand = (const char *)malloc(reference_shorthand.length() + 1);
    // copy the string content from the utf8value
    memcpy((void *)from_reference_shorthand, *reference_shorthand, reference_shorthand.length());
    // insert the null terminator
    memset((void*)(((const char *)from_reference_shorthand) + reference_shorthand.length()), 0, 1);

    baton->ref_list->push_back(from_reference_shorthand);
  }

  Nan::Callback *callback = new Nan::Callback(Local<Function>::Cast(info[1]));
  GetReferencesFromListWorker *worker = new GetReferencesFromListWorker(baton, callback);
  worker->SaveToPersistent("repo", info.This());
  Nan::AsyncQueueWorker(worker);
  return;
}

void GitRepository::GetReferencesFromListWorker::Execute()
{
  giterr_clear();

  LockMaster lockMaster(true, baton->repo);
  git_repository *repo = baton->repo;

  for (unsigned int i = 0; i < baton->ref_list->size(); ++i) {
    git_reference *reference;
    int error_code = git_reference_dwim(&reference, repo, baton->ref_list->at(i));

    if (error_code != GIT_OK) {
      baton->out->push_back(NULL);
    } else if (git_reference_type(reference) == GIT_REF_SYMBOLIC) {
      git_reference *resolved_reference;
      int resolve_result = git_reference_resolve(&resolved_reference, reference);
      git_reference_free(reference);

      if (resolve_result == GIT_OK) {
        baton->out->push_back(resolved_reference);
      } else {
        baton->out->push_back(NULL);
      }
    } else {
      baton->out->push_back(reference);
    }
  }
}

void GitRepository::GetReferencesFromListWorker::HandleOKCallback()
{
  unsigned int size = baton->out->size();
  Local<Array> result = Nan::New<Array>(size);
  for (unsigned int i = 0; i < size; i++) {
    git_reference *reference = baton->out->at(i);
    if (reference == NULL) {
      Nan::Set(result, Nan::New<Number>(i), Nan::Null());
    } else {
      Nan::Set(
        result,
        Nan::New<Number>(i),
        GitRefs::New(
          reference,
          true,
          GitRepository::New(git_reference_owner(reference), true)->ToObject()
        )
      );
    }
  }

  while (baton->ref_list->size()) {
    delete baton->ref_list->back();
    baton->ref_list->pop_back();
  }
  delete baton->ref_list;
  delete baton->out;

  Local<v8::Value> argv[2] = {
    Nan::Null(),
    result
  };
  callback->Call(2, argv, async_resource);
}
