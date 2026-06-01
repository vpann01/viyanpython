// Pyodide-powered Python playground: editor + safe in-browser execution + checks.
const Playground = (() => {
  let pyodide = null, loading = null;

  function ensure() {
    if (pyodide) return Promise.resolve(pyodide);
    if (loading) return loading;
    loading = loadPyodide().then((py) => {
      pyodide = py;
      // capture stdout/stderr into a buffer
      py.runPython(`
import sys, io
class _Cap(io.StringIO):
    pass
`);
      return py;
    });
    return loading;
  }

  // run code, return {stdout, error}
  async function run(code) {
    const py = await ensure();
    let out = '', err = null;
    py.setStdout({ batched: (s) => { out += s + '\n'; } });
    py.setStderr({ batched: (s) => { out += s + '\n'; } });
    try {
      await py.runPythonAsync(code);
    } catch (e) {
      err = String(e.message || e);
    }
    return { stdout: out.replace(/\n+$/,''), error: err };
  }

  // normalize for comparison (trim trailing spaces per line)
  function norm(s) {
    return (s || '').split('\n').map((l) => l.replace(/\s+$/,'')).join('\n').trim();
  }

  // check: expected_stdout match OR a substring "check" present in output
  function judge(result, pg) {
    if (result.error) return { pass: false, why: result.error };
    const got = norm(result.stdout);
    if (pg.expected_stdout != null) {
      const want = norm(pg.expected_stdout);
      if (got === want) return { pass: true };
      if (pg.check && got.includes(norm(pg.check))) return { pass: true };
      return { pass: false, why: `Expected:\n${want}\n\nGot:\n${got || '(nothing printed)'}` };
    }
    if (pg.check && got.includes(norm(pg.check))) return { pass: true };
    return { pass: true }; // free-play
  }

  // mount a CodeMirror editor into el
  function editor(el, starter) {
    return CodeMirror(el, {
      value: starter || '', mode: 'python', theme: 'dracula',
      lineNumbers: true, indentUnit: 4, tabSize: 4, smartIndent: true,
      lineWrapping: true, autofocus: false,
      extraKeys: { Tab: (cm) => cm.replaceSelection('    ') },
    });
  }

  return { ensure, run, judge, editor, get ready() { return !!pyodide; } };
})();
