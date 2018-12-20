NAN_METHOD(GitRepository::GetReferences)
{
  if (info.Length() == 0 || !info[0]->IsFunction()) {
    return Nan::ThrowError("Callback is required and must be a Function.");
  }

  GetReferencesBaton* baton = new GetReferencesBaton;

  baton->error_code = GIT_OK;
  baton->error = NULL;
  baton->out = new std::vector<git_reference *>;
  baton->repo = Nan::ObjectWrap::Unwrap<GitRepository>(info.This())->GetValue();

  Nan::Callback *callback = new Nan::Callback(Local<Function>::Cast(info[0]));
  GetReferencesWorker *worker = new GetReferencesWorker(baton, callback);
  worker->SaveToPersistent("repo", info.This());
  Nan::AsyncQueueWorker(worker);
  return;
}

void GitRepository::GetReferencesWorker::Execute()
{
  giterr_clear();

  LockMaster lockMaster(true, baton->repo);
  git_repository *repo = baton->repo;

  git_strarray reference_names;
  baton->error_code = git_reference_list(&reference_names, repo);

  if (baton->error_code != GIT_OK) {
    if (giterr_last() != NULL) {
      baton->error = git_error_dup(giterr_last());
    }
    delete baton->out;
    baton->out = NULL;
    return;
  }

  for (size_t reference_index = 0; reference_index < reference_names.count; ++reference_index) {
    git_reference *reference;
    baton->error_code = git_reference_lookup(&reference, repo, reference_names.strings[reference_index]);

    // stop execution and return if there is an error
    if (baton->error_code != GIT_OK) {
      if (giterr_last() != NULL) {
        baton->error = git_error_dup(giterr_last());
      }

      // unwind and return
      while (baton->out->size()) {
        git_reference *referenceToFree = baton->out->back();
        baton->out->pop_back();
        git_reference_free(referenceToFree);
      }

      git_strarray_free(&reference_names);
      git_repository_free(repo);
      delete baton->out;
      baton->out = NULL;
      return;
    }

    if (git_reference_type(reference) == GIT_REF_SYMBOLIC) {
      git_reference *resolved_reference;
      int resolve_result = git_reference_resolve(&resolved_reference, reference);
      git_reference_free(reference);

      // if we can't resolve the ref, then just ignore it
      if (resolve_result == GIT_OK) {
        baton->out->push_back(resolved_reference);
      }
    } else {
      baton->out->push_back(reference);
    }
  }
}

void GitRepository::GetReferencesWorker::HandleOKCallback()
{
  if (baton->out != NULL)
  {
    unsigned int size = baton->out->size();
    Local<Array> result = Nan::New<Array>(size);
    for (unsigned int i = 0; i < size; i++) {
      git_reference *reference = baton->out->at(i);
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

    delete baton->out;

    Local<v8::Value> argv[2] = {
      Nan::Null(),
      result
    };
    callback->Call(2, argv, async_resource);
  }
  else if (baton->error)
  {
    Local<v8::Value> argv[1] = {
      Nan::Error(baton->error->message)
    };
    callback->Call(1, argv, async_resource);
    if (baton->error->message)
    {
      free((void *)baton->error->message);
    }

    free((void *)baton->error);
  }
  else if (baton->error_code < 0)
  {
    Local<v8::Object> err = Nan::Error("Repository getReferences has thrown an error.")->ToObject();
    err->Set(Nan::New("errno").ToLocalChecked(), Nan::New(baton->error_code));
    err->Set(Nan::New("errorFunction").ToLocalChecked(), Nan::New("Repository.getReferences").ToLocalChecked());
    Local<v8::Value> argv[1] = {
      err
    };
    callback->Call(1, argv, async_resource);
  }
  else
  {
    callback->Call(0, NULL, async_resource);
  }
}
