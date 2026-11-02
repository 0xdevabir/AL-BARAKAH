-- For throwaway load-test databases only: creates one customer and effectively unlimited stock.
INSERT INTO "User" (id, phone, name, role)
VALUES ('loadtest-customer', '+8801799999999', 'Load Test', 'CUSTOMER')
ON CONFLICT (id) DO NOTHING;

INSERT INTO "Address" (id, "userId", label, line, phone, "zoneId")
SELECT 'loadtest-address', 'loadtest-customer', 'Load', 'Load test', '+8801799999999', id FROM "Zone" LIMIT 1
ON CONFLICT (id) DO NOTHING;

UPDATE "Batch" SET "qtyRemaining" = 100000000;
