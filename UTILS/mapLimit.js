const timeDelay = require('./timeDelay');

/**
 * Runs `fn` over `items` with bounded concurrency.
 *
 * Every client.getContactById() call is a page.evaluate round-trip against a
 * single Chromium page. Firing thousands of them at once through a bare
 * Promise.allSettled is what produces "Execution context was destroyed" and
 * "Protocol error (Runtime.callFunctionOn): Promise was collected".
 *
 * @param {Array} items
 * @param {number} limit - how many to run at once
 * @param {(item: any) => Promise<any>} fn
 * @param {number} [pauseMs=250] - breathing room between batches
 * @returns {Promise<Array<PromiseSettledResult>>} settled results, in input order
 */
const mapLimit = async (items, limit, fn, pauseMs = 250) => {
  const results = [];

  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    results.push(...(await Promise.allSettled(batch.map(fn))));

    if (i + limit < items.length && pauseMs > 0) {
      await timeDelay(pauseMs);
    }
  }

  return results;
};

module.exports = mapLimit;
