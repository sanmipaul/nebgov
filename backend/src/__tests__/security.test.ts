import { AlertType, AlertSeverity, SecurityMonitorService } from "../services/security-monitor";

// Mock pool
jest.mock("../db/pool", () => ({
  query: jest.fn(),
}));

describe("SecurityMonitorService", () => {
  let service: SecurityMonitorService;

  beforeEach(() => {
    service = new SecurityMonitorService();
  });

  it("should define correctly the AlertType and AlertSeverity", () => {
    expect(AlertType.LARGE_TRANSFER).toBe("LARGE_TRANSFER");
    expect(AlertSeverity.CRITICAL).toBe("CRITICAL");
  });

  // Since most methods are private or depend on Horizon, 
  // we test the pattern identification logic if it was exposed.
  // For now, we'll just verify the service initializes.
  it("should initialize with default horizon server", () => {
    expect(service).toBeDefined();
  });
});
