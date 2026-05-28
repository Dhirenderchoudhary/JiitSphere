const asyncHandler = require('../../middlewares/asyncHandler');

describe('asyncHandler wrapper', () => {
  it('should resolve normally if the wrapped function resolves', async () => {
    const req = {};
    const res = {};
    const next = jest.fn();
    const fn = jest.fn().mockResolvedValue('success');

    const wrapped = asyncHandler(fn);
    await wrapped(req, res, next);

    expect(fn).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next with the error if the wrapped function rejects', async () => {
    const req = {};
    const res = {};
    const next = jest.fn();
    const error = new Error('test error');
    const fn = jest.fn().mockRejectedValue(error);

    const wrapped = asyncHandler(fn);
    await wrapped(req, res, next);

    expect(fn).toHaveBeenCalledWith(req, res, next);
    expect(next).toHaveBeenCalledWith(error);
  });
});
