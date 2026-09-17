<?php
// ==========================================
// Transcoding ساکار: ڤیدیۆ کۆپی، دەنگ AAC
// ==========================================
$target = isset($_GET['stream']) ? urldecode($_GET['stream']) : null;
if (!$target || !preg_match('#^https?://#i', $target)) {
    http_response_code(400);
    echo 'bad request';
    exit;
}

header('Content-Type: video/mp2t');
header('Cache-Control: no-cache');
header('X-Accel-Buffering: no');
set_time_limit(0);

while (ob_get_level()) { ob_end_clean(); }

$headers = "Referer: https://myrestreamer.com/\r\nOrigin: https://myrestreamer.com\r\n";

$cmd = sprintf(
    'ffmpeg -loglevel error -user_agent %s -headers %s -analyzeduration 50M -probesize 50M -fflags +genpts+igndts+discardcorrupt -err_detect ignore_err -reconnect 1 -reconnect_streamed 1 -reconnect_on_network_error 1 -reconnect_at_eof 1 -reconnect_delay_max 5 -i %s -map 0:v:0? -map 0:a:0? -c:v copy -c:a aac -b:a 160k -ac 2 -ar 48000 -f mpegts pipe:1 2>/dev/null',
    escapeshellarg('VLC/3.0.18 LibVLC/3.0.18'),
    escapeshellarg($headers),
    escapeshellarg($target)
);

$descriptors = [
    0 => ['pipe', 'r'],
    1 => ['pipe', 'w'],
    2 => ['file', '/dev/null', 'w'],
];

$proc = proc_open($cmd, $descriptors, $pipes);
if (!is_resource($proc)) {
    http_response_code(502);
    echo 'transcode failed to start';
    exit;
}

fclose($pipes[0]);
stream_set_blocking($pipes[1], true);

while (!feof($pipes[1])) {
    $chunk = fread($pipes[1], 65536);
    if ($chunk === false || $chunk === '') { break; }
    echo $chunk;
    @flush();
    if (connection_aborted()) { break; }
}

fclose($pipes[1]);
proc_terminate($proc, 9);
proc_close($proc);
exit;
?>
