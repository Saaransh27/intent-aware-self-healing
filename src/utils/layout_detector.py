TEST_DIR_NAMES = {"test", "tests", "spec", "specs"}
DOCUMENTATION_DIR_NAMES = {"doc", "docs", "documentation"}
EXAMPLE_DIR_NAMES = {"example", "examples", "sample", "samples", "demo", "demos"}
SCRIPT_DIR_NAMES = {"script", "scripts", "bin", "tools"}


def detect_layout(file_paths):
    top_level_dirs = set()
    for file_path in file_paths:
        if "/" not in file_path:
            continue
        dir_name = file_path.split("/", 1)[0]
        if dir_name.startswith("."):
            continue
        top_level_dirs.add(dir_name)

    directories = {"source": [], "tests": [], "documentation": [], "examples": [], "scripts": []}
    for dir_name in sorted(top_level_dirs):
        lowered = dir_name.lower()
        if lowered in TEST_DIR_NAMES:
            directories["tests"].append(f"{dir_name}/")
        elif lowered in DOCUMENTATION_DIR_NAMES:
            directories["documentation"].append(f"{dir_name}/")
        elif lowered in EXAMPLE_DIR_NAMES:
            directories["examples"].append(f"{dir_name}/")
        elif lowered in SCRIPT_DIR_NAMES:
            directories["scripts"].append(f"{dir_name}/")
        else:
            directories["source"].append(f"{dir_name}/")

    return {"directories": directories}
