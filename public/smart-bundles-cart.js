(function () {
  const DEBUG = false;
  const log = (...a) => DEBUG && console.log('[SmartBundles]', ...a);

  // Row = <tr class="cart-items__table-row ..." data-line-key="..." data-bundle-key="...">
  const SELECTOR_LINE = '.cart-items__table-row[data-line-key]';

  // Quantity input in your markup:
  // <quantity-selector-component> ... <input type="number" name="updates[]" ...>
  const SELECTOR_QTY_INPUT =
    'quantity-selector-component input[type="number"][name="updates[]"]';

  // Remove button in your markup:
  // <button class="button ... cart-items__remove" type="button" ...>
  const SELECTOR_REMOVE_BUTTON = '.cart-items__remove';

  const RELOAD_AFTER_CHANGE = true;

  function getLineKey(lineEl) {
    return lineEl.getAttribute('data-line-key');
  }

  function getBundleKey(lineEl) {
    return lineEl.getAttribute('data-bundle-key') || null;
  }

  function getLinesInSameBundle(bundleKey) {
    if (!bundleKey) return [];
    return Array.from(
      document.querySelectorAll(
        `${SELECTOR_LINE}[data-bundle-key="${bundleKey}"]`
      )
    );
  }

  async function changeLineQuantity(lineKey, quantity) {
    log('changeLineQuantity', lineKey, quantity);
    await fetch('/cart/change.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ id: lineKey, quantity }),
    });
  }

  async function updateBundleFromLine(lineEl, newQty) {
    const lineKey = getLineKey(lineEl);
    const bundleKey = getBundleKey(lineEl);

    // Not in a bundle: just update this line
    if (!bundleKey) {
      await changeLineQuantity(lineKey, newQty);
      return;
    }

    const allLines = getLinesInSameBundle(bundleKey);
    log('update bundle', bundleKey, 'to qty', newQty, allLines.length);

    for (const row of allLines) {
      const key = getLineKey(row);
      if (!key) continue;
      await changeLineQuantity(key, newQty);
    }
  }

  async function removeBundleFromLine(lineEl) {
    const lineKey = getLineKey(lineEl);
    const bundleKey = getBundleKey(lineEl);

    const lines = bundleKey ? getLinesInSameBundle(bundleKey) : [lineEl];
    log('remove bundle', bundleKey, 'lines', lines.length);

    for (const row of lines) {
      const key = getLineKey(row);
      if (!key) continue;
      await changeLineQuantity(key, 0);
    }
  }

  function bindEvents() {
    const root = document;

    // Quantity change (we just watch the <input>)
    root.addEventListener('change', async (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (!input.matches(SELECTOR_QTY_INPUT)) return;

      const lineEl = input.closest(SELECTOR_LINE);
      if (!lineEl) return;

      const newQty = parseInt(input.value, 10);
      if (isNaN(newQty) || newQty < 0) return;

      event.preventDefault();
      event.stopPropagation(); // stop theme’s own JS from firing

      try {
        await updateBundleFromLine(lineEl, newQty);
      } catch (err) {
        console.error('[SmartBundles] qty change failed', err);
      } finally {
        if (RELOAD_AFTER_CHANGE) window.location.reload();
      }
    });

    // Remove click
    root.addEventListener('click', async (event) => {
      const button = event.target.closest(SELECTOR_REMOVE_BUTTON);
      if (!button) return;

      const lineEl = button.closest(SELECTOR_LINE);
      if (!lineEl) return;

      event.preventDefault();
      event.stopPropagation(); // stop theme’s onLineItemRemove handler

      try {
        await removeBundleFromLine(lineEl);
      } catch (err) {
        console.error('[SmartBundles] remove failed', err);
      } finally {
        if (RELOAD_AFTER_CHANGE) window.location.reload();
      }
    });
  }

  function init() {
    try {
      bindEvents();
      log('SmartBundles bundle-sync initialised');
    } catch (err) {
      console.error('[SmartBundles] init error', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
