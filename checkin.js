// checkin.js - GitHub Actions 版本
// 环境变量：DOMAIN / USER / PASS / TGTOKEN / TGID

async function initializeVariables() {
  let domain = process.env.JC || process.env.DOMAIN || '';
  let user   = process.env.ZH || process.env.USER  || '';
  let pass   = process.env.MM || process.env.PASS  || '';

  if (!domain || !user || !pass) {
    throw new Error('缺少必要环境变量：DOMAIN / USER / PASS');
  }

  if (!domain.includes('//')) domain = `https://${domain}`;

  return {
    domain,
    user,
    pass,
    botToken: process.env.TGTOKEN || '',
    chatID:   process.env.TGID    || '',
  };
}

async function sendMessage(cfg, msg = '') {
  const { domain, user, pass, botToken, chatID } = cfg;

  if (!chatID) return; // TG 未配置，跳过

  const now = new Date();
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const formattedTime = beijingTime.toISOString().slice(0, 19).replace('T', ' ');

  const accountInfo = `地址: ${domain}\n账号: ${user}\n密码: <tg-spoiler>${pass}</tg-spoiler>`;
  const text = encodeURIComponent(
    `执行时间: ${formattedTime}\n${accountInfo}\n\n${msg}`
  );

  const baseURL = botToken
    ? `https://api.telegram.org/bot${botToken}/sendMessage`
    : `https://api.tg.090227.xyz/sendMessage`;

  const url = `${baseURL}?chat_id=${chatID}&parse_mode=HTML&text=${text}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;',
      'Accept-Encoding': 'gzip, deflate, br',
      'User-Agent': 'Mozilla/5.0 Chrome/90.0.4430.72',
    },
  });

  if (!res.ok) {
    console.warn('TG 推送失败:', await res.text());
  }
}

async function checkin(cfg) {
  const { domain, user, pass } = cfg;

  // ── 1. 登录 ──────────────────────────────────────────────
  const loginRes = await fetch(`${domain}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      'Accept':   'application/json, text/plain, */*',
      'Origin':   domain,
      'Referer':  `${domain}/auth/login`,
    },
    body: JSON.stringify({ email: user, passwd: pass, remember_me: 'on', code: '' }),
  });

  console.log('Login status:', loginRes.status);

  if (!loginRes.ok) {
    throw new Error(`登录请求失败 (${loginRes.status}): ${await loginRes.text()}`);
  }

  const loginJson = await loginRes.json();
  console.log('Login response:', loginJson);

  if (loginJson.ret !== 1) {
    throw new Error(`登录失败: ${loginJson.msg || '未知错误'}`);
  }

  // ── 2. 提取 Cookie ────────────────────────────────────────
  const cookieHeader = loginRes.headers.get('set-cookie');
  if (!cookieHeader) throw new Error('登录成功但未收到 Cookie');

  const cookies = cookieHeader
    .split(',')
    .map(c => c.split(';')[0])
    .join('; ');

  console.log('Cookies received (partial):', cookies.slice(0, 40) + '...');

  // ── 3. 等待登录状态生效 ───────────────────────────────────
  await new Promise(r => setTimeout(r, 1000));

  // ── 4. 签到 ──────────────────────────────────────────────
  const checkinRes = await fetch(`${domain}/user/checkin`, {
    method: 'POST',
    headers: {
      'Cookie':             cookies,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      'Accept':             'application/json, text/plain, */*',
      'Content-Type':       'application/json',
      'Origin':             domain,
      'Referer':            `${domain}/user/panel`,
      'X-Requested-With':   'XMLHttpRequest',
    },
  });

  console.log('Checkin status:', checkinRes.status);
  const rawText = await checkinRes.text();
  console.log('Checkin raw response:', rawText);

  let result;
  try {
    const json = JSON.parse(rawText);
    result = `🎉 签到结果 🎉\n${json.msg || (json.ret === 1 ? '签到成功' : '签到失败/已签到')}`;
  } catch {
    if (rawText.includes('登录')) throw new Error('登录状态无效，请检查 Cookie 处理');
    throw new Error(`解析签到响应失败\n原始响应: ${rawText}`);
  }

  console.log(result);
  await sendMessage(cfg, result);
  return result;
}

// ── 入口 ────────────────────────────────────────────────────
(async () => {
  try {
    const cfg = await initializeVariables();
    await checkin(cfg);
    process.exit(0);
  } catch (err) {
    const msg = `签到过程发生错误: ${err.message}`;
    console.error(msg);
    try {
      const cfg = await initializeVariables().catch(() => null);
      if (cfg) await sendMessage(cfg, msg);
    } catch {}
    process.exit(1);
  }
})();
