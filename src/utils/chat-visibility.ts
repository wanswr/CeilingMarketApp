export function isChatAvailable(params: {
  userId: string;
  employerId: string;
  executorId?: string | null;
  applicationStatus?: string | null;
}): boolean {
  const { userId, employerId, executorId, applicationStatus } = params;
  if (!userId) return false;

  const normalize = (id: any) => id?.toString().trim().toLowerCase();
  const nid = normalize(userId);
  const nEmployer = normalize(employerId);
  const nExecutor = normalize(executorId);

  const isEmployer = nid === nEmployer;
  const isAssignedExecutor = !!nExecutor && nid === nExecutor;

  if (isEmployer) {
    return !!nExecutor;
  }

  if (isAssignedExecutor) {
    return true;
  }

  return false;
}
