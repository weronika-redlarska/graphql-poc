import { Cache, InMemoryCache } from '@apollo/client'

export class LoggingInMemoryCache extends InMemoryCache {
  constructor(private readonly uri: string) {
    super()
  }

  override diff<T>(options: Cache.DiffOptions): Cache.DiffResult<T> {
    const result = super.diff<T>(options)

    if (options.query) {
      console.log(`${result.complete ? 'cache hit' : 'cache miss'} ${this.uri}`)
    }

    return result
  }
}