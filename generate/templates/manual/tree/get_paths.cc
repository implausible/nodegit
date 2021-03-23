NAN_METHOD(GitTree::GetPaths)
{
  if (info.Length() == 0 || !info[0]->IsFunction()) {
    return Nan::ThrowError("Callback is required and must be a Function.");
  }

  GetPathsBaton* baton = new GetPathsBaton();

  baton->error_code = GIT_OK;
  baton->error = NULL;
  baton->out = new std::vector<std::string>;
  baton->tree = Nan::ObjectWrap::Unwrap<GitTree>(info.This())->GetValue();

  Nan::Callback *callback = new Nan::Callback(Local<Function>::Cast(info[0]));
  GetPathsWorker *worker = new GetPathsWorker(baton, callback);
  worker->Reference<GitTree>("tree", info.This());
  nodegit::Context *nodegitContext = reinterpret_cast<nodegit::Context *>(info.Data().As<External>()->Value());
  nodegitContext->QueueWorker(worker);
  return;
}

nodegit::LockMaster GitTree::GetPathsWorker::AcquireLocks() {
  nodegit::LockMaster lockMaster(true, baton->tree);
  return lockMaster;
}

void GitTree::GetPathsWorker::Execute()
{
  std::function<bool(git_tree *, std::string)> walk = [this, &walk](git_tree *tree, std::string currentPath) -> bool {
    size_t numEntries = git_tree_entrycount(tree);
    for (size_t i = 0; i < numEntries; ++i) {
      const git_tree_entry *entry = git_tree_entry_byindex(tree, i);
      const char *name = git_tree_entry_name(entry);
      if (git_tree_entry_type(entry) == GIT_OBJECT_BLOB) {
        baton->out->emplace_back(currentPath.length() == 0 ? name : currentPath + "/" + name);
      }

      if (git_tree_entry_type(entry) == GIT_OBJECT_TREE) {
        git_tree *childTree;
        baton->error_code = git_tree_lookup(&childTree, git_tree_owner(baton->tree), git_tree_entry_id(entry));
        if (baton->error_code != GIT_OK) {
          if (giterr_last() != NULL) {
            baton->error = git_error_dup(giterr_last());
          }

          return false;
        }

        bool result = walk(childTree, currentPath.length() == 0 ? name : currentPath + "/" + name);
        git_tree_free(childTree);
        if (!result) {
          return result;
        }
      }
    }

    return true;
  };

  if (!walk(baton->tree, "")) {
    delete baton->out;
    baton->out = NULL;
  }
}

void GitTree::GetPathsWorker::HandleErrorCallback() {
  if (baton->error) {
    if (baton->error->message) {
      free((void *)baton->error->message);
    }

    free((void *)baton->error);
  }

  delete baton->out;
  delete baton;
}

void GitTree::GetPathsWorker::HandleOKCallback()
{
  if (baton->out != NULL)
  {
    unsigned int size = baton->out->size();
    Local<Array> result = Nan::New<Array>(size);
    for (unsigned int i = 0; i < size; i++) {
      Nan::Set(result, Nan::New<Number>(i), Nan::New(baton->out->at(i)).ToLocalChecked());
    }

    delete baton->out;

    Local<v8::Value> argv[2] = {
      Nan::Null(),
      result
    };
    callback->Call(2, argv, async_resource);
  }
  else
  {
    if (baton->error)
    {
      Local<v8::Object> err;
      if (baton->error->message) {
        err = Nan::To<v8::Object>(Nan::Error(baton->error->message)).ToLocalChecked();
      } else {
        err = Nan::To<v8::Object>(Nan::Error("Method getPaths has thrown an error.")).ToLocalChecked();
      }
      Nan::Set(err, Nan::New("errno").ToLocalChecked(), Nan::New(baton->error_code));
      Nan::Set(err, Nan::New("errorFunction").ToLocalChecked(), Nan::New("GitTree.getPaths").ToLocalChecked());
      Local<v8::Value> argv[1] = {
        err
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
      Local<v8::Object> err = Nan::To<v8::Object>(Nan::Error("Method getPaths has thrown an error.")).ToLocalChecked();
      Nan::Set(err, Nan::New("errno").ToLocalChecked(), Nan::New(baton->error_code));
      Nan::Set(err, Nan::New("errorFunction").ToLocalChecked(), Nan::New("GitTree.getPaths").ToLocalChecked());
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

  delete baton;
}
