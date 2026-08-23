import { isChatAvailable } from './chat-visibility';

describe('Chat Action Visibility Policy', () => {
  const employerId = 'emp-100';
  const executorId = 'exec-200';
  const strangerId = 'user-300';

  it('Employer + PENDING applicant -> chat action unavailable', () => {
    const available = isChatAvailable({
      userId: employerId,
      employerId,
      executorId: null,
      applicationStatus: 'PENDING',
    });
    expect(available).toBe(false);
  });

  it('Employer + ACCEPTED executor -> chat available', () => {
    const available = isChatAvailable({
      userId: employerId,
      employerId,
      executorId,
      applicationStatus: 'ACCEPTED',
    });
    expect(available).toBe(true);
  });

  it('PENDING executor -> chat unavailable', () => {
    const available = isChatAvailable({
      userId: strangerId,
      employerId,
      executorId: null,
      applicationStatus: 'PENDING',
    });
    expect(available).toBe(false);
  });

  it('ACCEPTED executor -> chat available', () => {
    const available = isChatAvailable({
      userId: executorId,
      employerId,
      executorId,
      applicationStatus: 'ACCEPTED',
    });
    expect(available).toBe(true);
  });

  it('REJECTED executor -> chat unavailable', () => {
    const available = isChatAvailable({
      userId: strangerId,
      employerId,
      executorId,
      applicationStatus: 'REJECTED',
    });
    expect(available).toBe(false);
  });
});
