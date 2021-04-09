struct DiffPoint {
  DiffPoint(char _origin, int _oldLineNumber, int _newLineNumber)
    : origin(_origin), oldLineNumber(_oldLineNumber), newLineNumber(_newLineNumber)
  {}

  char origin;
  int oldLineNumber;
  int newLineNumber;
};

struct DiffPayload {
  std::vector<DiffPoint> *diffPoints;
  bool wasBinary;
};

NAN_METHOD(GitDiff::CalculateSES)
{
  if (info.Length() == 0 || !info[0]->IsObject()) {
    return Nan::ThrowError("Repository repo is required.");
  }

  if (info.Length() == 1 || !info[1]->IsObject()) {
    return Nan::ThrowError("Oid oldBlob is required.");
  }

  if (info.Length() == 2 || !info[2]->IsObject()) {
    return Nan::ThrowError("Oid newBlob is required.");
  }

  if (info.Length() == 3 && !info[3]->IsFunction()) {
    return Nan::ThrowError("Callback is required and must be a Function.");
  }

  if (info.Length() == 4 && !info[3]->IsObject()) {
    return Nan::ThrowError("Options must be an object");
  }

  Nan::Callback *callback;
  if (info.Length() == 4) {
    if (!info[3]->IsObject()) {
      return Nan::ThrowError("Options must be an object");
    }

    if (!info[4]->IsFunction()) {
      return Nan::ThrowError("Callback is required and must be a Function.");
    }

    if (!info)

    callback = new Nan::Callback(v8::Local<v8::Function>::Cast(info[4]));
  } else {
    callback = new Nan::Callback(v8::Local<v8::Function>::Cast(info[3]));
  }

  if (info.Length() == 3 || !info[3]->IsObject()) {
    return Nan::ThrowError("DiffOption is required.");
  }

  if (info.Length() == 4 || !info[4]->IsNumber()) {
    return Nan::ThrowError("FileLength is required.");
  }

  CalculateSESBaton* baton = new CalculateSESBaton();

  baton->error_code = GIT_OK;
  baton->error = NULL;
  baton->out = new std::vector<DiffPoint>;
  baton->was_binary = false;
  baton->repo = Nan::ObjectWrap::Unwrap<GitRepository>(Nan::To<v8::Object>(info[0]).ToLocalChecked())->GetValue();
  baton->old_blob = Nan::ObjectWrap::Unwrap<GitBlob>(Nan::To<v8::Object>(info[1]).ToLocalChecked())->GetValue();
  baton->new_blob = Nan::ObjectWrap::Unwrap<GitBlob>(Nan::To<v8::Object>(info[2]).ToLocalChecked())->GetValue();
  baton->diff_flags = (uint32_t) info[3].As<v8::Number>()->Value();
  baton->context_lines = (uint32_t) info[4].As<v8::Number>()->Value();

  Nan::Callback *callback = new Nan::Callback(Local<Function>::Cast(info[5]));
  CalculateSESWorker *worker = new CalculateSESWorker(baton, callback);
  worker->SaveToPersistent("repo", info[0]);
  worker->SaveToPersistent("oldBlob", info[1]);
  worker->SaveToPersistent("newBlob", info[2]);

  nodegit::Context *nodegitContext = reinterpret_cast<nodegit::Context *>(info.Data().As<External>()->Value());
  nodegitContext->QueueWorker(worker);
  return;
}

nodegit::LockMaster GitDiff::CalculateSESWorker::AcquireLocks() {
  nodegit::LockMaster lockMaster(true, baton->repo, baton->old_blob, baton->new_blob);
  return lockMaster;
}

void GitDiff::CalculateSESWorker::Execute() {
  git_diff_options options;
  baton->error_code = git_diff_options_init(&options, GIT_DIFF_OPTIONS_VERSION);
  if (baton->error_code != GIT_OK) {

  }

  options.flags = baton->diff_flags;
  options.context_lines = baton->context_lines;

  DiffPayload payload {
    static_cast<std::vector<DiffPoint> *>(baton->out),
    false,
    false
  };

  baton->error_code = git_diff_blobs(
    baton->old_blob,
    NULL,
    baton->new_blob,
    NULL,
    &options,
    NULL,
    [](const git_diff_delta *delta, const git_diff_binary *binary, void *_payload) -> int {
      DiffPayload *payload = static_cast<DiffPayload *>(_payload);
      payload->wasBinary = true;
      return 0;
    },
    NULL,
    [](const git_diff_delta *delta, const git_diff_hunk *hunk, const git_diff_line *line, void *_payload) -> int {
      DiffPayload *payload = static_cast<DiffPayload *>(_payload);
      payload->diffPoints->emplace_back(line->origin, line->old_lineno, line->new_lineno);
      std::cout << line->num_lines << std::endl;
      return 0;
    },
    &payload
  );

  if (baton->error_code != GIT_OK) {

  }
}

void GitDiff::CalculateSESWorker::HandleErrorCallback() {
  if (baton->error) {
    if (baton->error->message) {
      free((void *)baton->error->message);
    }

    free((void *)baton->error);
  }

  delete static_cast<std::vector<DiffPoint> *>(baton->out);
  delete baton;
}

void GitDiff::CalculateSESWorker::HandleOKCallback()
{
  if (baton->out != NULL)
  {
    std::vector<DiffPoint> *diffPoints = static_cast<std::vector<DiffPoint> *>(baton->out);
    unsigned int size = diffPoints->size();
    v8::Local<v8::Array> jsDiffPoints = Nan::New<v8::Array>(size);
    for (unsigned int i = 0; i < size; i++) {
      auto diffPoint = diffPoints->at(i);
      v8::Local<v8::Object> jsDiffPoint = Nan::New<v8::Object>();
      Nan::Set(jsDiffPoint, Nan::New("origin").ToLocalChecked(), Nan::New(std::string(1, diffPoint.origin)).ToLocalChecked());
      Nan::Set(jsDiffPoint, Nan::New("oldLineNumber").ToLocalChecked(), Nan::New(diffPoint.oldLineNumber));
      Nan::Set(jsDiffPoint, Nan::New("newLineNumber").ToLocalChecked(), Nan::New(diffPoint.newLineNumber));
      Nan::Set(jsDiffPoints, Nan::New<Number>(i), jsDiffPoint);
    }

    delete static_cast<std::vector<DiffPoint> *>(diffPoints);

    v8::Local<v8::Object> result = Nan::New<v8::Object>();
    Nan::Set(result, Nan::New("diffPoints").ToLocalChecked(), jsDiffPoints);
    Nan::Set(result, Nan::New("wasBinary").ToLocalChecked(), Nan::New<v8::Boolean>(baton->was_binary));

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
        err = Nan::To<v8::Object>(Nan::Error("Method calculateSES has thrown an error.")).ToLocalChecked();
      }
      Nan::Set(err, Nan::New("errno").ToLocalChecked(), Nan::New(baton->error_code));
      Nan::Set(err, Nan::New("errorFunction").ToLocalChecked(), Nan::New("GitDiff.calculateSES").ToLocalChecked());
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
      Local<v8::Object> err = Nan::To<v8::Object>(Nan::Error("Method calculateSES has thrown an error.")).ToLocalChecked();
      Nan::Set(err, Nan::New("errno").ToLocalChecked(), Nan::New(baton->error_code));
      Nan::Set(err, Nan::New("errorFunction").ToLocalChecked(), Nan::New("GitDiff.calculateSES").ToLocalChecked());
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
