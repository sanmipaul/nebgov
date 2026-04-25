import { z } from "zod";
import { validate } from "./validate";
import { Request, Response } from "express";

describe("validate middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFunction: jest.Mock;

  beforeEach(() => {
    mockReq = {
      params: {},
      query: {},
      body: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    nextFunction = jest.fn();
  });

  const schema = {
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    }),
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      name: z.string().min(3),
    }),
  };

  it("should pass valid input and transform data", async () => {
    mockReq.query = { limit: "10", offset: "5" };
    mockReq.params = { id: "123" };
    mockReq.body = { name: "Test Name" };

    const middleware = validate(schema);
    await middleware(mockReq as Request, mockRes as Response, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
    expect(mockReq.query).toEqual({ limit: 10, offset: 5 });
    expect(mockReq.params).toEqual({ id: 123 });
    expect(mockReq.body).toEqual({ name: "Test Name" });
  });

  it("should return 400 for invalid query param", async () => {
    mockReq.query = { limit: "0" }; // min is 1
    mockReq.params = { id: "1" };
    mockReq.body = { name: "Valid Name" };

    const middleware = validate(schema);
    await middleware(mockReq as Request, mockRes as Response, nextFunction);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: "limit",
          }),
        ]),
      })
    );
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it("should return 400 for invalid param", async () => {
    mockReq.params = { id: "not-a-number" };
    mockReq.query = { limit: "20" };
    mockReq.body = { name: "Valid Name" };

    const middleware = validate(schema);
    await middleware(mockReq as Request, mockRes as Response, nextFunction);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: "id",
          }),
        ]),
      })
    );
  });

  it("should return 400 for invalid body", async () => {
    mockReq.body = { name: "ab" }; // min is 3
    mockReq.params = { id: "1" };
    mockReq.query = { limit: "20" };

    const middleware = validate(schema);
    await middleware(mockReq as Request, mockRes as Response, nextFunction);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: "name",
          }),
        ]),
      })
    );
  });

  it("should use default values", async () => {
    mockReq.query = {};
    mockReq.params = { id: "1" };
    mockReq.body = { name: "Valid Name" };

    const middleware = validate(schema);
    await middleware(mockReq as Request, mockRes as Response, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
    expect(mockReq.query).toEqual({ limit: 20, offset: 0 });
  });
});
