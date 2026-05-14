// e2e/firstTest.e2e.js

describe('First Test', () => {
  it('should display the correct screen', async () => {
    await element(by.id('welcomeScreen')).toBeVisible();
  });
});
