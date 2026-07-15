def rank_co_changed_files(file_path, historical_file_lists, top_n=10):
    counts = {}
    for file_list in historical_file_lists:
        for other_path in file_list:
            if other_path == file_path:
                continue
            counts[other_path] = counts.get(other_path, 0) + 1

    ranked = sorted(counts.items(), key=lambda item: item[1], reverse=True)
    return [
        {"path": path, "co_change_count": count}
        for path, count in ranked[:top_n]
    ]
