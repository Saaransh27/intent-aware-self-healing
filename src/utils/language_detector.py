from pathlib import Path

EXTENSION_LANGUAGES = {
    ".py": "Python",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".sh": "Shell",
    ".bash": "Shell",
    ".java": "Java",
    ".c": "C",
    ".h": "C",
    ".cpp": "C++",
    ".cc": "C++",
    ".hpp": "C++",
    ".go": "Go",
    ".rs": "Rust",
    ".rb": "Ruby",
    ".php": "PHP",
    ".html": "HTML",
    ".htm": "HTML",
    ".css": "CSS",
    ".scss": "CSS",
    ".json": "JSON",
    ".yml": "YAML",
    ".yaml": "YAML",
    ".sql": "SQL",
    ".md": "Markdown",
    ".rst": "reStructuredText",
    ".kt": "Kotlin",
    ".swift": "Swift",
    ".cs": "C#",
    ".scala": "Scala",
}


def detect_languages(file_paths):
    counts = {}
    for file_path in file_paths:
        language = EXTENSION_LANGUAGES.get(Path(file_path).suffix.lower())
        if language:
            counts[language] = counts.get(language, 0) + 1

    detected_languages = sorted(counts, key=counts.get, reverse=True)
    return {
        "primary_language": detected_languages[0] if detected_languages else None,
        "detected_languages": detected_languages,
    }
