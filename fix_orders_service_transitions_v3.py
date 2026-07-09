with open('backend/src/modules/orders/orders.service.ts', 'r') as f:
    lines = f.readlines()

with open('backend/src/modules/orders/orders.service.ts', 'w') as f:
    for line in lines:
        if "[OrderStatus.COMPLETED]: []," in line:
            f.write(line)
            f.write("    [OrderStatus.REVIEWED]: [],\n")
        elif "[OrderStatus.REVIEWED]: []," in line:
            # Skip if we already wrote it or if it is the one we want to replace
            continue
        else:
            f.write(line)
