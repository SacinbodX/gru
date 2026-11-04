<?php
// Ixtiyoriy: PHP hosting (cPanel va h.k.) uchun JSON-ombor. Render'dagi Node server bilan bog'liq emas.
// GET  store.php        -> foydalanuvchi ma'lumoti
// POST store.php (JSON) -> name, age, lang, mine ni saqlaydi
// Sozlash: BOT_TOKEN ni muhit o'zgaruvchisiga qo'ying.
header('Content-Type: application/json');
$token = getenv('BOT_TOKEN');
parse_str($_SERVER['HTTP_X_INIT_DATA'] ?? '', $p);
$hash = $p['hash'] ?? ''; unset($p['hash']); ksort($p);
$check = implode("\n", array_map(fn($k, $v) => "$k=$v", array_keys($p), $p));
$secret = hash_hmac('sha256', $token, 'WebAppData', true);
if (!$hash || !hash_equals(hash_hmac('sha256', $check, $secret), $hash)) { http_response_code(401); exit('{"error":"unauthorized"}'); }
$tg = json_decode($p['user'] ?? '{}', true);
$dir = __DIR__ . '/../data'; @mkdir($dir, 0775, true);
$file = "$dir/users.json";
$fp = fopen($file, 'c+'); flock($fp, LOCK_EX);
$db = json_decode(stream_get_contents($fp) ?: '{}', true) ?: [];
$id = (string)($tg['id'] ?? 0);
$db[$id] ??= ['id' => $id, 'name' => $tg['first_name'] ?? '', 'age' => '', 'lang' => 'uz', 'mine' => [], 'xp' => 0, 'streak' => 0];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $b = json_decode(file_get_contents('php://input'), true) ?: [];
  if (isset($b['name'])) $db[$id]['name'] = mb_substr(trim($b['name']), 0, 40);
  if (isset($b['age'])) $db[$id]['age'] = max(4, min(99, (int)$b['age']));
  if (in_array($b['lang'] ?? '', ['uz', 'ru', 'en'])) $db[$id]['lang'] = $b['lang'];
  if (isset($b['mine']) && is_array($b['mine'])) $db[$id]['mine'] = array_slice($b['mine'], 0, 1000);
  ftruncate($fp, 0); rewind($fp); fwrite($fp, json_encode($db, JSON_UNESCAPED_UNICODE));
}
flock($fp, LOCK_UN); fclose($fp);
echo json_encode(['user' => $db[$id]], JSON_UNESCAPED_UNICODE);
