import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns ok status for container health checks', () => {
    const controller = new HealthController();

    expect(controller.check()).toEqual({ status: 'ok' });
  });
});
