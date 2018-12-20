NAN_METHOD(GitRepository::GetSubmodules)
{
  if (info.Length() == 0 || !info[0]->IsFunction()) {
    return Nan::ThrowError("Callback is required and must be a Function.");
  }

  GetSubmodulesBaton* baton = new GetSubmodulesBaton;

  baton->error_code = GIT_OK;
  baton->error = NULL;
  baton->out = new std::vector<git_submodule *>;
  baton->repo = Nan::ObjectWrap::Unwrap<GitRepository>(info.This())->GetValue();

  Nan::Callback *callback = new Nan::Callback(Local<Function>::Cast(info[0]));
  GetSubmodulesWorker *worker = new GetSubmodulesWorker(baton, callback);
  worker->SaveToPersistent("repo", info.This());
  Nan::AsyncQueueWorker(worker);
  return;
}

struct submodule_foreach_payload {
  git_repository *repo;
  std::vector<git_submodule *> *out;
};

int foreachSubmoduleCB(git_submodule *submodule, const char *name, void *void_payload) {
  submodule_foreach_payload *payload = (submodule_foreach_payload *)void_payload;
  git_submodule *out;

  int result = git_submodule_lookup(&out, payload->repo, name);
  if (result == GIT_OK) {
    payload->out->push_back(out);
  }

  return result;
}

void GitRepository::GetSubmodulesWorker::Execute()
{
  giterr_clear();

  LockMaster lockMaster(true, baton->repo);

  submodule_foreach_payload payload { baton->repo, baton->out };
  baton->error_code = git_submodule_foreach(baton->repo, foreachSubmoduleCB, (void *)&payload);

  if (baton->error_code != GIT_OK) {
    if (giterr_last() != NULL) {
      baton->error = git_error_dup(giterr_last());
    }

    while (baton->out->size()) {
      git_submodule_free(baton->out->back());
      baton->out->pop_back();
    }
    delete baton->out;
    baton->out = NULL;
  }
}

void GitRepository::GetSubmodulesWorker::HandleOKCallback()
{
  if (baton->out != NULL)
  {
    unsigned int size = baton->out->size();
    Local<Array> result = Nan::New<Array>(size);
    for (unsigned int i = 0; i < size; i++) {
      git_submodule *submodule = baton->out->at(i);
      Nan::Set(
        result,
        Nan::New<Number>(i),
        GitSubmodule::New(
          submodule,
          true,
          GitRepository::New(git_submodule_owner(submodule), true)->ToObject()
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
    Local<v8::Object> err = Nan::Error("Repository getSubmodules has thrown an error.")->ToObject();
    err->Set(Nan::New("errno").ToLocalChecked(), Nan::New(baton->error_code));
    err->Set(Nan::New("errorFunction").ToLocalChecked(), Nan::New("Repository.getSubmodules").ToLocalChecked());
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
