export type Result<T, E = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export type AppErrorCode =
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "UNAVAILABLE"
  | "FORBIDDEN"
  | "INTERNAL";

export type AppError = {
  readonly code: AppErrorCode;
  readonly message: string;
  readonly cause?: unknown;
};

export function appError(
  code: AppErrorCode,
  message: string,
  cause?: unknown,
): AppError {
  return cause === undefined ? { code, message } : { code, message, cause };
}

export type Id<Brand extends string> = string & { readonly __brand: Brand };

export function createId<Brand extends string>(value: string): Id<Brand> {
  return value as Id<Brand>;
}

export function newId<Brand extends string>(
  prefix: string,
  random: () => string = () =>
    `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`,
): Id<Brand> {
  return createId<Brand>(`${prefix}_${random()}`);
}
