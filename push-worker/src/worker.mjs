import webpush from 'web-push';

const json = (body, status = 200, origin = '*') => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': origin, 'vary': 'Origin' } });
const unauthorized = origin => json({ error: 'Nicht autorisiert.' }, 401, origin);

async function authenticatedUser(request, env) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: token }) });
  if (!response.ok) return null;
  const data = await response.json();
  return data.users?.[0] ? { uid: data.users[0].localId, token } : null;
}

async function coachUser(user, env) {
  if (user.uid && user.token) {
    const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/team_memberships/${user.uid}`;
    const response = await fetch(url, { headers: { authorization: `Bearer ${user.token}` } });
    if (response.ok) {
      const data = await response.json();
      return ['coach', 'club_admin'].includes(data.fields?.role?.stringValue);
    }
  }
  return false;
}

function agent(env) { return env.TEAM_PUSH.get(env.TEAM_PUSH.idFromName('u18-notifications')); }
async function agentRequest(env, path, data) { return agent(env).fetch(`https://push.internal${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }); }

export class TeamPush {
  constructor(state, env) { this.state = state; this.env = env; }
  async data() { return (await this.state.storage.get('data')) || { subscriptions: {}, jobs: [] }; }
  async save(data) { await this.state.storage.put('data', data); }
  async setNextAlarm(data) {
    const next = data.jobs.filter(job => job.status === 'scheduled').map(job => new Date(job.scheduled_at).getTime()).filter(Boolean).sort((a, b) => a - b)[0];
    if (next) await this.state.storage.setAlarm(next); else await this.state.storage.deleteAlarm();
  }
  async fetch(request) {
    const body = await request.json(); const data = await this.data(); const path = new URL(request.url).pathname;
    if (path === '/subscribe') {
      const { uid, deviceId, subscription } = body;
      if (!uid || !deviceId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return json({ error: 'Ungültiges Geräte-Abo.' }, 400);
      data.subscriptions[`${uid}:${deviceId}`] = { uid, deviceId, subscription, updated_at: new Date().toISOString() };
      await this.save(data); return json({ ok: true });
    }
    if (path === '/jobs') {
      const job = { ...body.job, id: crypto.randomUUID(), status: new Date(body.job.scheduled_at).getTime() > Date.now() + 5000 ? 'scheduled' : 'sending', created_at: new Date().toISOString() };
      data.jobs.unshift(job); await this.save(data);
      if (job.status === 'sending') { const result = await this.deliver(job, data); job.status = 'sent'; job.sent_at = new Date().toISOString(); job.sent_count = result.sent; job.failed_count = result.failed; await this.save(data); }
      await this.setNextAlarm(data); return json({ job });
    }
    if (path === '/jobs-list') return json({ jobs: data.jobs.slice(0, 40) });
    if (path === '/jobs-delete') {
      const id = String(body.id || '');
      const job = data.jobs.find(item => item.id === id);
      if (!job) return json({ error: 'Mitteilung nicht gefunden.' }, 404);
      if (job.status === 'sending') return json({ error: 'Mitteilung wird gerade versendet.' }, 409);
      data.jobs = data.jobs.filter(item => item.id !== id);
      await this.save(data); await this.setNextAlarm(data);
      return json({ ok: true, id });
    }
    return json({ error: 'Nicht gefunden.' }, 404);
  }
  async alarm() {
    const data = await this.data(); const now = Date.now();
    for (const job of data.jobs.filter(item => item.status === 'scheduled' && new Date(item.scheduled_at).getTime() <= now)) {
      job.status = 'sending'; const result = await this.deliver(job, data); job.status = 'sent'; job.sent_at = new Date().toISOString(); job.sent_count = result.sent; job.failed_count = result.failed;
    }
    await this.save(data); await this.setNextAlarm(data);
  }
  async deliver(job, data) {
    webpush.setVapidDetails(this.env.VAPID_SUBJECT, this.env.VAPID_PUBLIC_KEY, this.env.VAPID_PRIVATE_KEY);
    const targets = Object.entries(data.subscriptions).filter(([, item]) => job.recipients.includes(item.uid));
    let sent = 0, failed = 0; const remove = [];
    await Promise.all(targets.map(async ([key, item]) => {
      try { await webpush.sendNotification(item.subscription, JSON.stringify({ title: job.title, body: job.body, url: job.url, tag: `u18-${job.id}` }), { TTL: 86400, urgency: 'normal' }); sent++; }
      catch (error) { failed++; if ([404, 410].includes(error?.statusCode)) remove.push(key); }
    }));
    remove.forEach(key => delete data.subscriptions[key]);
    return { sent, failed };
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const allowed = origin === env.ALLOWED_ORIGIN ? origin : env.ALLOWED_ORIGIN;
    if (request.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': allowed, 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', 'access-control-allow-headers': 'authorization, content-type' } });
    const path = new URL(request.url).pathname;
    if (path === '/config' && request.method === 'GET') return json({ vapidPublicKey: env.VAPID_PUBLIC_KEY }, 200, allowed);
    const user = await authenticatedUser(request, env);
    if (!user) return unauthorized(allowed);
    if (path === '/subscriptions' && request.method === 'POST') {
      const input = await request.json();
      const result = await agentRequest(env, '/subscribe', { uid: user.uid, deviceId: input.deviceId, subscription: input.subscription });
      return new Response(result.body, { status: result.status, headers: { ...Object.fromEntries(result.headers), 'access-control-allow-origin': allowed } });
    }
    if (path === '/jobs' && request.method === 'POST') {
      if (!await coachUser(user, env)) return unauthorized(allowed);
      const input = await request.json();
      const result = await agentRequest(env, '/jobs', { job: { ...input.job, created_by: user.uid } });
      return new Response(result.body, { status: result.status, headers: { ...Object.fromEntries(result.headers), 'access-control-allow-origin': allowed } });
    }
    if (path === '/jobs' && request.method === 'GET') {
      if (!await coachUser(user, env)) return unauthorized(allowed);
      const result = await agentRequest(env, '/jobs-list', {});
      return new Response(result.body, { status: result.status, headers: { ...Object.fromEntries(result.headers), 'access-control-allow-origin': allowed } });
    }
    if (path.startsWith('/jobs/') && request.method === 'DELETE') {
      if (!await coachUser(user, env)) return unauthorized(allowed);
      const id = decodeURIComponent(path.slice('/jobs/'.length));
      if (!id) return json({ error: 'Mitteilungs-ID fehlt.' }, 400, allowed);
      const result = await agentRequest(env, '/jobs-delete', { id });
      return new Response(result.body, { status: result.status, headers: { ...Object.fromEntries(result.headers), 'access-control-allow-origin': allowed } });
    }
    return json({ error: 'Nicht gefunden.' }, 404, allowed);
  }
};
