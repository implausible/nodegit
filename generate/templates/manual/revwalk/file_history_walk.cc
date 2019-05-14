
class FileHistoryEvent {
public:
  FileHistoryEvent(git_delta_t inputType, bool inputIsMerge = false, std::shared_ptr<git_commit> inputCommit = NULL):
    type(inputType),
    existsInCurrentTree(false),
    isMerge(inputIsMerge),
    from(NULL),
    to(NULL),
    commit(inputCommit) {}

  FileHistoryEvent(char *inputFrom, char *inputTo = NULL):
    type(GIT_DELTA_RENAMED),
    existsInCurrentTree(inputFrom != NULL),
    isMerge(false),
    from(inputFrom),
    to(inputTo),
    commit(NULL) {}

  FileHistoryEvent(git_delta_t inputType):
    type(inputType),
    existsInCurrentTree(inputType == GIT_DELTA_ADDED || inputType)

  static std::unique_ptr<FileHistoryEvent> buildHistoryEvent(
    git_repository *repo,
    std::shared_ptr<git_commit> currentCommit,
    git_tree *currentTree,
    git_tree *parentTree,
    const char *filePath
  ) {
    git_tree_entry *unsafeEntry;
    if (git_tree_entry_bypath(&unsafeEntry, currentTree, filePath) != GIT_OK) {
      unsafeEntry = NULL;
    }
    std::unique_ptr<git_tree_entry, decltype(&git_tree_entry_free)> currentEntry(unsafeEntry, &git_tree_entry_free);
    if (git_tree_entry_bypath(&unsafeEntry, parentTree, filePath) != GIT_OK) {
      unsafeEntry = NULL;
    }
    std::unique_ptr<git_tree_entry, decltype(&git_tree_entry_free)> parentEntry(unsafeEntry, &git_tree_entry_free);

    if (!currentEntry && !parentEntry) {
      return new FileHistoryEvent(
        GIT_DELTA_UNMODIFIED
      );
    }
  }

  git_delta_t type;
  bool existsInCurrentTree, isMerge;
  char *from, *to;
  std::shared_ptr<git_commit> commit;
};

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
  baton->max_count = Nan::To<unsigned int>(info[1]).FromJust();
  baton->out = new std::vector<std::unique_ptr<FileHistoryEvent>>;
  baton->out->reserve(baton->max_count);
  baton->walk = Nan::ObjectWrap::Unwrap<GitRevwalk>(info.This())->GetValue();

  Nan::Callback *callback = new Nan::Callback(Local<Function>::Cast(info[2]));
  FileHistoryWalkWorker *worker = new FileHistoryWalkWorker(baton, callback);
  worker->SaveToPersistent("fileHistoryWalk", info.This());

  Nan::AsyncQueueWorker(worker);
  return;
}

void GitRevwalk::FileHistoryWalkWorker::Execute()
{
  git_repository *repo = git_revwalk_repository(baton->walk);
  git_oid currentOid;
  git_error_clear();
  for (
    unsigned int revwalkIterations = 0;
    revwalkIterations < baton->max_count && (baton->error_code = git_revwalk_next(&currentOid, baton->walk)) == GIT_OK;
    ++revwalkIterations
  ) {
    git_commit *unsafeCommit;
    if ((baton->error_code = git_commit_lookup(&unsafeCommit, repo, currentOid)) != GIT_OK) {
      break;
    }
    std::shared_ptr<git_commit> currentCommit(unsafeCommit, &git_commit_free);
    unsafeCommit = NULL;

    git_tree *unsafeTree;
    if ((baton->error_code = git_commit_tree(&unsafeTree, currentCommit.get())) != GIT_OK) {
      break;
    }
    std::unique_ptr<git_tree, decltype(&git_tree_free)> currentTree(unsafeTree, &git_tree_free);
    unsafeTree = NULL;

    unsigned int parentCount = git_commit_parentcount(currentCommit);
    if (parentCount == 0) {
      git_tree_entry* entry;
      if (git_tree_entry_bypath(&entry, currentTree.get(), baton->file_path) == GIT_OK) {
        baton->out->push_back(new FileHistoryEvent(GIT_DELTA_ADDED, std::move(currentCommit)));
        git_tree_entry_free(entry);
      }
      continue;
    }

    if (parentCount == 1) {
      if ((baton->error_code = git_commit_parent(&unsafeCommit, currentCommit.get(), 0)) != GIT_OK) {
        break;
      }
      std::unique_ptr<git_commit, decltype(&git_commit_free)> parentCommit(unsafeCommit, &git_commit_free);
      unsafeCommit = NULL;

      if ((baton->error_code = git_commit_tree(&unsafeTree, parentCommit.get())) != GIT_OK) {
        break;
      }
      std::unique_ptr<git_tree, decltype(&git_tree_free)> parentTree(unsafeTree, &git_tree_free);
      unsafeTree = NULL;

      std::unique_ptr<FileHistoryEvent> fileHistoryEvent = FileHistoryEvent::buildHistoryEvent(
        repo,
        std::move(currentCommit),
        currentTree.get(),
        parentTree.get(),
        baton->file_path
      );

      if (fileHistoryEvent == NULL) {
        break;
      }

      if (fileHistoryEvent->type != GIT_DELTA_UNMODIFIED) {
        baton->out->push_back(std::move(fileHistoryEvent));
      }

      continue;
    }

    std::pair<bool, unsigned int> firstMatchingParentIndex(false, 0);
    bool fileExistsInCurrent = false, fileExistsInSomeParent = false;
    for (unsigned int parentIndex = 0; parentIndex < parentCount; ++parentIndex) {
      if ((baton->error_code = git_commit_parent(&unsafeCommit, currentCommit.get(), parentIndex)) != GIT_OK) {
        break;
      }
      std::unique_ptr<git_commit, decltype(&git_commit_free)> parentCommit(unsafeCommit, &git_commit_free);
      unsafeCommit = NULL;

      if ((baton->error_code = git_commit_tree(&unsafeTree, parentCommit.get())) != GIT_OK) {
        break;
      }
      std::unique_ptr<git_tree, decltype(&git_tree_free)> parentTree(unsafeTree, &git_tree_free);
      unsafeTree = NULL;

      std::unique_ptr<FileHistoryEvent> fileHistoryEvent = FileHistoryEvent::buildHistoryEvent(
        repo,
        currentCommit,
        currentTree.get(),
        parentTree.get(),
        baton->file_path
      );

      switch (fileHistoryEvent->type) {
        case GIT_DELTA_ADDED:
        case GIT_DELTA_MODIFIED: {
          fileExistsInCurrent = true;
          break;
        }
        case GIT_DELTA_DELETED: {
          fileExistsInSomeParent = true;
          break;
        }
        case GIT_DELTA_RENAMED: {
          if (fileHistoryEvent->existsInCurrentTree) {
            fileExistsInCurrent = true;
          } else {
            fileExistsInSomeParent = true;
          }
          break;
        }
        case GIT_DELTA_UNMODIFIED: {
          if (fileHistoryEvent->existsInCurrentTree) {
            fileExistsInCurrent = true;
            fileExistsInSomeParent = true;
          }
          firstMatchingParentIndex = std::make_pair(true, parentIndex);
          break;
        }
        default: {
          break;
        }
      }

      if (firstMatchingParentIndex.first) {
        break;
      }
    }

    if (!firstMatchingParentIndex.first) {
      assert(fileExistsInCurrent || fileExistsInSomeParent);
      git_delta_t mergeType;
      if (fileExistsInCurrent && fileExistsInSomeParent) {
        mergeType = GIT_DELTA_MODIFIED;
      } else if (fileExistsInCurrent) {
        mergeType = GIT_DELTA_ADDED;
      } else if (fileExistsInSomeParent) {
        mergeType = GIT_DELTA_DELETED;
      }

      std::unique_ptr<FileHistoryEvent> fileHistoryEvent = new FileHistoryEvent(
        mergeType,
        true,
        std::move(currentCommit)
      );
      baton->out->push_back(std::move(fileHistoryEvent));
      continue;
    }

    assert(firstMatchingParentIndex.first);
    for (unsigned int parentIndex = 0; parentIndex < parentCount; ++parentIndex) {
      if (parentIndex == firstMatchingParentIndex.second) {
        continue;
      }

      const git_oid *parentOid = git_commit_parent_id(currentCommit.get());
      assert(parentOid != NULL);
      git_revwalk_hide(baton->walk, parentOid);
    }
  }

  if (baton->error_code != GIT_OK && baton->error_code != GIT_ITEROVER) {
    // Something went wrong in our loop, discard everything in the async worker
    baton->out->clear();
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

    Nan::Set(result, Nan::New("reachedEndOfHistory").ToLocalChecked(), Nan::New(baton->error_code == GIT_ITEROVER));

    Local<v8::Value> argv[2] = {
      Nan::Null(),
      result
    };
    callback->Call(2, argv, async_resource);

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
    err->Set(Nan::New("errorFunction").ToLocalChecked(), Nan::New("Revwalk.fileHistoryWalk").ToLocalChecked());
    Local<v8::Value> argv[1] = {
      err
    };
    callback->Call(1, argv, async_resource);
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
    err->Set(Nan::New("errorFunction").ToLocalChecked(), Nan::New("Revwalk.fileHistoryWalk").ToLocalChecked());
    Local<v8::Value> argv[1] = {
      err
    };
    callback->Call(1, argv, async_resource);
    return;
  }

  callback->Call(0, NULL, async_resource);
}
