/* Shared stream sniffer — single source of truth for both the player in
   andam.html and the admin bulk audit page. Byte-level sniffing for IPTV
   links: Content-Type alone lies constantly (playlist entries ending in
   .m3u8 answer with raw video/MP2T, and some hosts return a JSON/HTML error
   page with a 200). Read the first chunk of the body and decide from the
   actual bytes. */
(function (root) {
  function hexOf(b, n) {
    var o = [];
    for (var i = 0; i < Math.min(n, b.length); i++) o.push(('0' + b[i].toString(16)).slice(-2));
    return o.join(' ');
  }

  function classifyHead(o, quiet) {
    var b = o.head || new Uint8Array(0), txt = '';
    for (var i = 0; i < Math.min(b.length, 600); i++) txt += String.fromCharCode(b[i]);
    var head = txt.replace(/^\uFEFF/, '').replace(/^\s+/, '');
    if (!quiet) {
      console.log('[player] stream probe status=' + o.status + ' content-type=' + (o.ct || '(none)')
        + ' bytes=' + b.length + ' first16=' + (hexOf(b, 16) || '(empty)'));
    }
    o.first16 = hexOf(b, 16);
    if (head.indexOf('#EXTM3U') === 0) { o.kindOf = 'hls'; return o }
    if (b.length && b[0] === 0x47 && (b.length < 189 || b[188] === 0x47)) { o.kindOf = 'mpegts'; return o }
    if (b.length > 2 && b[0] === 0x46 && b[1] === 0x4c && b[2] === 0x56) { o.kindOf = 'flv'; return o }
    if (head.indexOf('<MPD') >= 0 || o.ct.indexOf('dash+xml') >= 0) { o.kindOf = 'dash'; return o }
    if (head.charAt(0) === '{' || head.charAt(0) === '[' || /^<!doctype|^<html/i.test(head)
      || o.ct.indexOf('json') >= 0 || o.ct.indexOf('text/html') >= 0) { o.kindOf = 'bad'; o.text = head; return o }
    if (o.ct.indexOf('mpegurl') >= 0) o.kindOf = 'hls';
    else if (o.ct.indexOf('x-flv') >= 0 || o.ct.indexOf('video/flv') >= 0) o.kindOf = 'flv';
    else if (o.ct.indexOf('mp2t') >= 0 || o.ct.indexOf('mpegts') >= 0 || o.ct.indexOf('mpeg-ts') >= 0
      || o.ct.indexOf('video/mpeg') >= 0) o.kindOf = 'mpegts';
    else o.kindOf = 'file';
    return o;
  }

  /* opts: {timeout: ms, quiet: true} — the audit page runs many of these at
     once and does not want one console line per channel. */
  function sniffStream(src, opts) {
    opts = opts || {};
    var ms = opts.timeout || 5000, quiet = !!opts.quiet;
    var ctl = root.AbortController ? new AbortController() : null;
    var timeout = setTimeout(function () { if (ctl) try { ctl.abort() } catch (_) { } }, ms);
    return fetch(src, { headers: { range: 'bytes=0-8191' }, signal: ctl ? ctl.signal : undefined }).then(function (r) {
      var o = { ok: r.ok || r.status === 206, status: r.status, ct: (r.headers.get('content-type') || '').toLowerCase() };
      /* Never use arrayBuffer() here: a live MPEG-TS body never ends, so it
         would hang forever. Read exactly one chunk and cancel. */
      if (!r.body || !r.body.getReader) { clearTimeout(timeout); o.head = new Uint8Array(0); return classifyHead(o, quiet) }
      var reader = r.body.getReader();
      return reader.read().then(function (res) {
        clearTimeout(timeout);
        o.head = res && res.value ? new Uint8Array(res.value) : new Uint8Array(0);
        try { reader.cancel() } catch (_) { }
        try { if (ctl) ctl.abort() } catch (_) { }
        return classifyHead(o, quiet);
      });
    }).catch(function (e) { clearTimeout(timeout); throw e });
  }

  root.AndamSniff = { hexOf: hexOf, classifyHead: classifyHead, sniffStream: sniffStream };
})(typeof window !== 'undefined' ? window : globalThis);
