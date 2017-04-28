NAN_METHOD(GitRevwalk::FileHistoryWalk)
{
  if (info.Length() == 0 || !info[0]->IsString()) {
    return Nan::ThrowError("File path to get the history is required.");
  }

  if (info.Length() == 1 || !info[1]->IsNumber()) {
    return Nan::ThrowError("Max count is required and must be a number.");
  }

  if (info.Length() == 2 || !info[2]->IsFunction()) {
    return Nan::ThrowError("Callback is required and must be a Function.");
  }

  FileHistoryWalkBaton* baton = new FileHistoryWalkBaton;

  baton->error_code = GIT_OK;
  baton->error = NULL;
  String::Utf8Value from_js_file_path(info[0]->ToString());
  baton->file_path = strdup(*from_js_file_path);
  baton->max_count = (unsigned int)info[1]->ToNumber()->Value();
  baton->out = new std::vector< std::pair<git_commit *, std::pair<char *, git_delta_t> > *>;
  baton->out->reserve(baton->max_count);
  baton->walk = Nan::ObjectWrap::Unwrap<GitRevwalk>(info.This())->GetValue();

  Nan::Callback *callback = new Nan::Callback(Local<Function>::Cast(info[2]));
  FileHistoryWalkWorker *worker = new FileHistoryWalkWorker(baton, callback);
  worker->SaveToPersistent("fileHistoryWalk", info.This());

  Nan::AsyncQueueWorker(worker);
  return;
}

#define forEachOid(baton, i, nextOid) \
  for (i = 0; i < baton->max_count && (baton->error_code = git_revwalk_next(nextOid, baton->walk)) == GIT_OK; ++i)

void GitRevwalk::FileHistoryWalkWorker::Execute()
{
  git_repository *repo = git_revwalk_repository(baton->walk);
  git_oid *nextOid = (git_oid *)malloc(sizeof(git_oid));
  git_diff_options opts = GIT_DIFF_OPTIONS_INIT;
  const char *filePath = strdup(baton->file_path);
  unsigned int i;

  giterr_clear();
  opts.pathspec.strings = &filePath;
  opts.pathspec.count = 1;

  forEachOid(baton, i, nextOid) {
    git_commit *commit, *parent;
    git_diff *diffs;
    git_tree *thisTree, *parentTree;
    git_patch *patch;
    const git_diff_delta *delta;
    std::pair<git_commit *, std::pair<char *, git_delta_t> > *historyEntry;
    unsigned int numDeltas, numParents;
    bool flag = false, doRenamedPass = false;

    if ((baton->error_code = git_commit_lookup(&commit, repo, nextOid)) < GIT_OK) {
      break;
    }

    if ((baton->error_code = git_commit_tree(&thisTree, commit)) < GIT_OK) {
      git_commit_free(commit);
      break;
    }

    numParents = git_commit_parentcount(commit);

    if (numParents > 1) {
      git_commit_free(commit);
      continue;
    } else if (numParents == 1) {
      if ((baton->error_code = git_commit_parent(&parent, commit, 0)) < GIT_OK) {
        git_commit_free(commit);
        break;
      }
      if (
        (baton->error_code = git_commit_tree(&parentTree, parent)) < GIT_OK
        || (baton->error_code = git_diff_tree_to_tree(&diffs, repo, parentTree, thisTree, &opts)) < GIT_OK
      ) {
        git_commit_free(commit);
        git_commit_free(parent);
        break;
      }
    } else {
      if ((baton->error_code = git_diff_tree_to_tree(&diffs, repo, NULL, thisTree, &opts)) < GIT_OK) {
        git_commit_free(commit);
        break;
      }
    }

    numDeltas = git_diff_num_deltas(diffs);

    for (unsigned int deltaIndex = 0; deltaIndex < numDeltas; ++deltaIndex) {
      patch = NULL;

      if ((baton->error_code = git_patch_from_diff(&patch, diffs, deltaIndex)) < GIT_OK) {
        break;
      }

      if (patch == NULL) {
        continue;
      }

      delta = git_patch_get_delta(patch);

      if (!strcmp(delta->new_file.path, baton->file_path)) {
        if (delta->status == GIT_DELTA_ADDED || delta->status == GIT_DELTA_DELETED) {
          doRenamedPass = true;
          git_patch_free(patch);
          break;
        }

        if (strcmp(delta->old_file.path, baton->file_path)) {
          historyEntry = new std::pair<git_commit *, std::pair<char *, git_delta_t> >(
            commit,
            std::pair<char *, git_delta_t>(strdup(delta->old_file.path), delta->status)
          );
        } else {
          historyEntry = new std::pair<git_commit *, std::pair<char *, git_delta_t> >(
            commit,
            std::pair<char *, git_delta_t>(strdup(delta->new_file.path), delta->status)
          );
        }

        baton->out->push_back(historyEntry);
        flag = true;
      }

      git_patch_free(patch);

      if (flag) {
        break;
      }
    }

    if (numParents >= 1 && doRenamedPass) {
      git_diff_free(diffs);

      if (
        (baton->error_code = git_diff_tree_to_tree(&diffs, repo, parentTree, thisTree, NULL)) < GIT_OK
        || (baton->error_code = git_diff_find_similar(diffs, NULL)) < GIT_OK
      ) {
        git_commit_free(commit);
        break;
      }

      flag = false;
      numDeltas = git_diff_num_deltas(diffs);

      for (unsigned int deltaIndex = 0; deltaIndex < numDeltas; ++deltaIndex) {
        int oldLen, newLen;
        char *outPair;

        patch = NULL;

        if ((baton->error_code = git_patch_from_diff(&patch, diffs, deltaIndex)) < GIT_OK) {
          break;
        }

        if (patch == NULL) {
          continue;
        }

        delta = git_patch_get_delta(patch);
        oldLen = strlen(delta->old_file.path);
        newLen = strlen(delta->new_file.path);
        outPair = new char[oldLen + newLen + 2];

        strcpy(outPair, delta->new_file.path);
        outPair[newLen] = '\n';
        outPair[newLen + 1] = '\0';
        strcat(outPair, delta->old_file.path);

        if (!strcmp(delta->new_file.path, baton->file_path)) {
          if (strcmp(delta->old_file.path, baton->file_path)) {
            historyEntry = new std::pair<git_commit *, std::pair<char *, git_delta_t> >(
              commit,
              std::pair<char *, git_delta_t>(strdup(outPair), delta->status)
            );
          } else {
            historyEntry = new std::pair<git_commit *, std::pair<char *, git_delta_t> >(
              commit,
              std::pair<char *, git_delta_t>(strdup(delta->new_file.path), delta->status)
            );
          }

          baton->out->push_back(historyEntry);
          flag = true;
        } else if (!strcmp(delta->old_file.path, baton->file_path)) {
          historyEntry = new std::pair<git_commit *, std::pair<char *, git_delta_t> >(
            commit,
            std::pair<char *, git_delta_t>(strdup(outPair), delta->status)
          );
          baton->out->push_back(historyEntry);
          flag = true;
        }

        delete[] outPair;

        git_patch_free(patch);

        if (flag) {
          break;
        }
      }
    }

    git_diff_free(diffs);

    if (!flag && commit != NULL) {
      git_commit_free(commit);
    }

    if (baton->error_code < GIT_OK) {
      break;
    }
  }

  free(nextOid);
  free(filePath);

  if (baton->error_code < GIT_OK) {
    if (baton->error_code != GIT_ITEROVER) {
      baton->error = git_error_dup(giterr_last());

      while(!baton->out->empty())
      {
        std::pair<git_commit *, std::pair<char *, git_delta_t> > *pairToFree = baton->out->back();
        baton->out->pop_back();
        git_commit_free(pairToFree->first);
        free(pairToFree->second.first);
        free(pairToFree);
      }

      delete baton->out;

      baton->out = NULL;
    }
  } else {
    baton->error_code = GIT_OK;
  }
}

void GitRevwalk::FileHistoryWalkWorker::HandleOKCallback()
{
  if (baton->out != NULL) {
    unsigned int size = baton->out->size();
    Local<Array> result = Nan::New<Array>(size);
    for (unsigned int i = 0; i < size; i++) {
      Local<v8::Object> historyEntry = Nan::New<Object>();
      std::pair<git_commit *, std::pair<char *, git_delta_t> > *batonResult = baton->out->at(i);
      Nan::Set(historyEntry, Nan::New("commit").ToLocalChecked(), GitCommit::New(batonResult->first, true));
      Nan::Set(historyEntry, Nan::New("status").ToLocalChecked(), Nan::New<Number>(batonResult->second.second));
      if (batonResult->second.second == GIT_DELTA_RENAMED) {
        char *namePair = batonResult->second.first;
        char *split = strchr(namePair, '\n');
        *split = '\0';
        char *oldName = split + 1;

        Nan::Set(historyEntry, Nan::New("oldName").ToLocalChecked(), Nan::New(oldName).ToLocalChecked());
        Nan::Set(historyEntry, Nan::New("newName").ToLocalChecked(), Nan::New(namePair).ToLocalChecked());
      }
      Nan::Set(result, Nan::New<Number>(i), historyEntry);

      free(batonResult->second.first);
      free(batonResult);
    }

    Local<v8::Value> argv[2] = {
      Nan::Null(),
      result
    };
    callback->Call(2, argv);

    delete baton->out;
    return;
  }

  if (baton->error) {
    Local<v8::Object> err;
    if (baton->error->message) {
      err = Nan::Error(baton->error->message)->ToObject();
    } else {
      err = Nan::Error("Method fileHistoryWalk has thrown an error.")->ToObject();
    }
    err->Set(Nan::New("errno").ToLocalChecked(), Nan::New(baton->error_code));
    Local<v8::Value> argv[1] = {
      err
    };
    callback->Call(1, argv);
    if (baton->error->message)
    {
      free((void *)baton->error->message);
    }

    free((void *)baton->error);
    return;
  }

  if (baton->error_code < 0) {
    Local<v8::Object> err = Nan::Error("Method next has thrown an error.")->ToObject();
    err->Set(Nan::New("errno").ToLocalChecked(), Nan::New(baton->error_code));
    Local<v8::Value> argv[1] = {
      err
    };
    callback->Call(1, argv);
    return;
  }

  callback->Call(0, NULL);
}
