/**
 * bun-types SQLite prepare() 타입 보강
 * bun-types@1.3.x의 prepare<T, P>에서 P가 optional하지 않아 발생하는 TS2558 에러를 수정한다.
 */
import "bun:sqlite";

declare module "bun:sqlite" {
  interface Database {
    prepare<ReturnType, ParamsType extends SQLQueryBindings | SQLQueryBindings[] = SQLQueryBindings[]>(
      sql: string,
      params?: ParamsType,
    ): import("bun:sqlite").Statement<ReturnType, ParamsType extends any[] ? ParamsType : [ParamsType]>;
  }
}
