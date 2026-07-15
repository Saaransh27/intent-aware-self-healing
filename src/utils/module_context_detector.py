def _directory_of(file_path):
    return file_path.rsplit("/", 1)[0] if "/" in file_path else ""


def get_local_module_files(file_path, tracked_files, changed_files, max_results=20):
    directory = _directory_of(file_path)
    excluded = set(changed_files)
    siblings = [
        other_path for other_path in tracked_files
        if other_path not in excluded and _directory_of(other_path) == directory
    ]
    return siblings[:max_results]
