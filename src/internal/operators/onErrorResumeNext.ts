/** @prettier */
import { Observable } from '../Observable';
import { ObservableInput, OperatorFunction, ObservedValueOf, ObservedValueUnionFromArray, MonoTypeOperatorFunction } from '../types';
import { operate } from '../util/lift';
import { innerFrom } from '../observable/from';
import { argsOrArgArray } from '../util/argsOrArgArray';
import { OperatorSubscriber } from './OperatorSubscriber';
import { noop } from '../util/noop';

export function onErrorResumeNext<T>(): MonoTypeOperatorFunction<T>;
export function onErrorResumeNext<T, O extends ObservableInput<any>>(arrayOfSources: O[]): OperatorFunction<T, T | ObservedValueOf<O>>;
export function onErrorResumeNext<T, A extends ObservableInput<any>[]>(
  ...sources: A
): OperatorFunction<T, T | ObservedValueUnionFromArray<A>>;

/**
 * When any of the provided Observable emits an complete or error notification, it immediately subscribes to the next one
 * that was passed.
 *
 * <span class="informal">Execute series of Observables, subscribes to next one on error or complete.</span>
 *
 * ![](onErrorResumeNext.png)
 *
 * `onErrorResumeNext` is an operator that accepts a series of Observables, provided either directly as
 * arguments or as an array. If no single Observable is provided, returned Observable will simply behave the same
 * as the source.
 *
 * `onErrorResumeNext` returns an Observable that starts by subscribing and re-emitting values from the source Observable.
 * When its stream of values ends - no matter if Observable completed or emitted an error - `onErrorResumeNext`
 * will subscribe to the first Observable that was passed as an argument to the method. It will start re-emitting
 * its values as well and - again - when that stream ends, `onErrorResumeNext` will proceed to subscribing yet another
 * Observable in provided series, no matter if previous Observable completed or ended with an error. This will
 * be happening until there is no more Observables left in the series, at which point returned Observable will
 * complete - even if the last subscribed stream ended with an error.
 *
 * `onErrorResumeNext` can be therefore thought of as version of {@link concat} operator, which is more permissive
 * when it comes to the errors emitted by its input Observables. While `concat` subscribes to the next Observable
 * in series only if previous one successfully completed, `onErrorResumeNext` subscribes even if it ended with
 * an error.
 *
 * Note that you do not get any access to errors emitted by the Observables. In particular do not
 * expect these errors to appear in error callback passed to {@link Observable#subscribe}. If you want to take
 * specific actions based on what error was emitted by an Observable, you should try out {@link catchError} instead.
 *
 *
 * ## Example
 * Subscribe to the next Observable after map fails
 * ```ts
 * import { of } from 'rxjs';
 * import { onErrorResumeNext, map } from 'rxjs/operators';
 *
 * of(1, 2, 3, 0).pipe(
 *   map(x => {
 *       if (x === 0) { throw Error(); }
 *        return 10 / x;
 *   }),
 *   onErrorResumeNext(of(1, 2, 3)),
 * )
 * .subscribe(
 *   val => console.log(val),
 *   err => console.log(err),          // Will never be called.
 *   () => console.log('that\'s it!')
 * );
 *
 * // Logs:
 * // 10
 * // 5
 * // 3.3333333333333335
 * // 1
 * // 2
 * // 3
 * // "that's it!"
 * ```
 *
 * @see {@link concat}
 * @see {@link catchError}
 *
 * @param {...ObservableInput} observables Observables passed either directly or as an array.
 * @return {Observable} An Observable that emits values from source Observable, but - if it errors - subscribes
 * to the next passed Observable and so on, until it completes or runs out of Observables.
 */
export function onErrorResumeNext<T>(...nextSources: ObservableInput<any>[]): OperatorFunction<T, unknown> {
  nextSources = argsOrArgArray(nextSources);

  return operate((source, subscriber) => {
    const remaining = [source, ...nextSources];
    const subscribeNext = () => {
      if (!subscriber.closed) {
        if (remaining.length > 0) {
          let nextSource: Observable<any>;
          try {
            nextSource = innerFrom(remaining.shift()!);
          } catch (err) {
            subscribeNext();
            return;
          }

          // Here we have to use one of our Subscribers, or it does not wire up
          // The `closed` property of upstream Subscribers synchronously, that
          // would result in situation were we could not stop a synchronous firehose
          // with something like `take(3)`.
          const innerSub = new OperatorSubscriber(subscriber, undefined, noop, noop);
          subscriber.add(nextSource.subscribe(innerSub));
          innerSub.add(subscribeNext);
        } else {
          subscriber.complete();
        }
      }
    };

    subscribeNext();
  });
}
