export class OrderCreatedEvent {
  constructor(
    public readonly orderId: string,
    public readonly title: string,
    public readonly employerId: string,
    public readonly price: number,
  ) {}
}

export class ApplicationCreatedEvent {
  constructor(
    public readonly applicationId: string,
    public readonly orderId: string,
    public readonly executorId: string,
    public readonly price?: number,
  ) {}
}

export class OrderStatusChangedEvent {
  constructor(
    public readonly orderId: string,
    public readonly oldStatus: string,
    public readonly newStatus: string,
    public readonly changedById?: string,
  ) {}
}
