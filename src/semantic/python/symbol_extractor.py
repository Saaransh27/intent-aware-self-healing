import ast


def _visibility(name):
    if len(name) > 4 and name.startswith("__") and name.endswith("__"):
        return "public"
    if name.startswith("_"):
        return "private"
    return "public"


def _scope_path(scope_stack):
    return ".".join(name for name, _ in scope_stack)


def _qualified_name(scope_stack, name):
    prefix = _scope_path(scope_stack)
    return f"{prefix}.{name}" if prefix else name


def _record_class(node, scope_stack, table):
    qualified_name = _qualified_name(scope_stack, node.name)
    table[qualified_name] = {
        "symbol_type": "class",
        "enclosing_scope": _scope_path(scope_stack) or None,
        "visibility": _visibility(node.name),
        "signature": None,
        "decorators": [ast.unparse(decorator) for decorator in node.decorator_list],
        "docstring": ast.get_docstring(node),
    }


def _record_function(node, scope_stack, table):
    is_method = bool(scope_stack) and scope_stack[-1][1] == "class"
    is_async = isinstance(node, ast.AsyncFunctionDef)
    if is_method:
        symbol_type = "async_method" if is_async else "method"
    else:
        symbol_type = "async_function" if is_async else "function"

    qualified_name = _qualified_name(scope_stack, node.name)
    table[qualified_name] = {
        "symbol_type": symbol_type,
        "enclosing_scope": _scope_path(scope_stack) or None,
        "visibility": _visibility(node.name),
        "signature": ast.unparse(node.args),
        "decorators": [ast.unparse(decorator) for decorator in node.decorator_list],
        "docstring": ast.get_docstring(node),
    }


def _walk(node, scope_stack, table):
    for child in ast.iter_child_nodes(node):
        if isinstance(child, ast.ClassDef):
            _record_class(child, scope_stack, table)
            _walk(child, scope_stack + [(child.name, "class")], table)
        elif isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
            _record_function(child, scope_stack, table)
            _walk(child, scope_stack + [(child.name, "function")], table)
        else:
            _walk(child, scope_stack, table)


def _build_symbol_table(source):
    tree = ast.parse(source)
    table = {}
    _walk(tree, [], table)
    return table


def _diff_docstring(old_docstring, new_docstring):
    if old_docstring is None and new_docstring is not None:
        return "added"
    if old_docstring is not None and new_docstring is None:
        return "removed"
    if old_docstring != new_docstring:
        return "changed"
    return "unchanged"


def _diff_decorators(old_decorators, new_decorators):
    added = [decorator for decorator in new_decorators if decorator not in old_decorators]
    removed = [decorator for decorator in old_decorators if decorator not in new_decorators]
    return added, removed


def _diff_symbol_tables(old_table, new_table):
    diffs = []
    for qualified_name in sorted(set(old_table) | set(new_table)):
        old_facts = old_table.get(qualified_name)
        new_facts = new_table.get(qualified_name)

        old_signature = old_facts["signature"] if old_facts else None
        new_signature = new_facts["signature"] if new_facts else None
        signature_changed = old_signature != new_signature

        old_decorators = old_facts["decorators"] if old_facts else []
        new_decorators = new_facts["decorators"] if new_facts else []
        decorators_added, decorators_removed = _diff_decorators(old_decorators, new_decorators)
        decorators_changed = bool(decorators_added or decorators_removed)

        old_docstring = old_facts["docstring"] if old_facts else None
        new_docstring = new_facts["docstring"] if new_facts else None
        docstring_status = _diff_docstring(old_docstring, new_docstring)

        if old_facts is None:
            change_type = "added"
        elif new_facts is None:
            change_type = "removed"
        elif signature_changed or decorators_changed or docstring_status != "unchanged":
            change_type = "modified"
        else:
            continue

        current_facts = new_facts or old_facts
        diffs.append({
            "qualified_name": qualified_name,
            "symbol_type": current_facts["symbol_type"],
            "change_type": change_type,
            "enclosing_scope": current_facts["enclosing_scope"],
            "visibility": current_facts["visibility"],
            "signature_changed": signature_changed,
            "signature": {"old": old_signature, "new": new_signature},
            "decorators_changed": decorators_changed,
            "decorators": {"added": decorators_added, "removed": decorators_removed},
            "docstring_status": docstring_status,
        })
    return diffs


def _import_texts(node):
    if isinstance(node, ast.Import):
        for alias in node.names:
            text = f"import {alias.name}"
            if alias.asname:
                text += f" as {alias.asname}"
            yield text
    elif isinstance(node, ast.ImportFrom):
        module_prefix = "." * node.level + (node.module or "")
        for alias in node.names:
            text = f"from {module_prefix} import {alias.name}"
            if alias.asname:
                text += f" as {alias.asname}"
            yield text


def _collect_imports(source):
    if source is None:
        return set()
    tree = ast.parse(source)
    imports = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            imports.update(_import_texts(node))
    return imports


def _diff_imports(old_source, new_source):
    old_imports = _collect_imports(old_source)
    new_imports = _collect_imports(new_source)
    return {
        "added": sorted(new_imports - old_imports),
        "removed": sorted(old_imports - new_imports),
    }


def extract_symbol_semantics(old_source, new_source, file_path):
    if old_source is None:
        change_type = "added"
    elif new_source is None:
        change_type = "deleted"
    else:
        change_type = "modified"

    try:
        old_table = _build_symbol_table(old_source) if old_source is not None else {}
        new_table = _build_symbol_table(new_source) if new_source is not None else {}
    except SyntaxError:
        return {
            "file_path": file_path,
            "old_path": None,
            "change_type": change_type,
            "parseable": False,
            "imports": None,
            "symbols": None,
        }

    return {
        "file_path": file_path,
        "old_path": None,
        "change_type": change_type,
        "parseable": True,
        "imports": _diff_imports(old_source, new_source),
        "symbols": _diff_symbol_tables(old_table, new_table),
    }
