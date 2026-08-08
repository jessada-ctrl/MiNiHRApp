import { MailerService } from '../auth/mailer.service';
import { AlertService, type Alert } from './alert.service';

const ALERT: Alert = { key: 'backup.failed', severity: 'critical', title: 'Nightly backup failed', detail: 'disk full' };

describe('AlertService', () => {
  let mailer: { sendOperatorAlert: jest.Mock };
  let fetchMock: jest.Mock;
  let service: AlertService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mailer = { sendOperatorAlert: jest.fn().mockResolvedValue(undefined) };
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('') });
    global.fetch = fetchMock as typeof fetch;

    process.env.ALERT_EMAIL_TO = 'ops@example.com, oncall@example.com';
    process.env.ALERT_LINE_CHANNEL_ACCESS_TOKEN = 'platform-token';
    process.env.ALERT_LINE_TARGET_ID = 'Cteam-group';

    service = new AlertService(mailer as unknown as MailerService);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('delivers to email and LINE together', async () => {
    await service.send(ALERT);

    expect(mailer.sendOperatorAlert).toHaveBeenCalledWith(
      ['ops@example.com', 'oncall@example.com'],
      'critical',
      'Nightly backup failed',
      'disk full',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ to: 'Cteam-group' });
  });

  // A failing dependency fails on a schedule. Without a cooldown the first
  // real incident buries the inbox, and the next genuine alert lands in a
  // feed nobody reads any more.
  it('sends the same alert key only once within the cooldown', async () => {
    await service.send(ALERT);
    await service.send(ALERT);
    await service.send(ALERT);

    expect(mailer.sendOperatorAlert).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not let one alert silence a different one', async () => {
    await service.send(ALERT);
    await service.send({ ...ALERT, key: 'backup.stale', title: 'Backups have stopped' });

    expect(mailer.sendOperatorAlert).toHaveBeenCalledTimes(2);
  });

  // Without this, a fault that recovers and recurs inside the hour goes
  // unreported — the second failure is silenced by the first one's cooldown.
  it('alerts again immediately after the condition has been cleared', async () => {
    await service.send(ALERT);
    service.clear(ALERT.key);
    await service.send(ALERT);

    expect(mailer.sendOperatorAlert).toHaveBeenCalledTimes(2);
  });

  it('still delivers by LINE when email is not configured', async () => {
    delete process.env.ALERT_EMAIL_TO;

    await service.send(ALERT);

    expect(mailer.sendOperatorAlert).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Every caller is already on a failure path; an alert that throws turns a
  // recoverable problem into a second one and still tells nobody.
  it('never throws when a delivery channel fails', async () => {
    mailer.sendOperatorAlert.mockRejectedValue(new Error('smtp unreachable'));
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(service.send(ALERT)).resolves.toBeUndefined();
  });

  it('sends nothing when no channel is configured', async () => {
    delete process.env.ALERT_EMAIL_TO;
    delete process.env.ALERT_LINE_CHANNEL_ACCESS_TOKEN;

    await service.send(ALERT);

    expect(mailer.sendOperatorAlert).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
