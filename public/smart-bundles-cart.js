(function () {
  // ------------- helpers -------------

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function injectCartStyles() {
    if (document.getElementById("sb-cart-bundle-styles")) return;

    var css = `
      .sb-cart-bundle {
        border: 1px solid #e1e3e5;
        border-radius: 8px;
        margin-bottom: 1rem;
        padding: 0.5rem 0;
      }

      .sb-cart-bundle-header {
        background: #f6f6f7;
      }

      .sb-cart-bundle-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        margin-top: 0.25rem;
        padding: 0.25rem 0.75rem;
        border-radius: 999px;
        border: 1px solid #d0d3d6;
        background: #fff;
        font-size: 0.8rem;
        cursor: pointer;
      }

      .sb-cart-bundle-toggle:focus-visible {
        outline: 2px solid #000;
        outline-offset: 2px;
      }

      .sb-cart-bundle-item {
        display: none;
      }

      .sb-cart-bundle.sb-cart-bundle--open .sb-cart-bundle-item {
        display: block;
      }

      .sb-cart-bundle .cart-item,
      .sb-cart-bundle .cart__row,
      .sb-cart-bundle li,
      .sb-cart-bundle tr,
      .sb-cart-bundle .cart-line-item {
        border: none;
      }

      .sb-cart-bundle-item .cart-item__name,
      .sb-cart-bundle-item .cart__product-name {
        padding-left: 1.25rem;
        position: relative;
      }

      .sb-cart-bundle-item .cart-item__name::before,
      .sb-cart-bundle-item .cart__product-name::before {
        content: "•";
        position: absolute;
        left: 0;
      }
    `;

    var style = document.createElement("style");
    style.id = "sb-cart-bundle-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function log() {
    if (!window.SB_CART_DEBUG) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift("[Smart Bundles Cart]");
    console.log.apply(console, args);
  }

  function formatMoney(cents) {
    var intCents = parseInt(cents, 10);
    if (isNaN(intCents)) intCents = 0;

    if (window.Shopify && typeof Shopify.formatMoney === "function") {
      return Shopify.formatMoney(
        intCents,
        (window.theme && theme.moneyFormat) || "{{amount}}"
      );
    }

    var value = (intCents / 100).toFixed(2);
    return "£" + value;
  }

  // ----- find the main cart scope (so we don't touch header drawers etc) -----

  var CART_SCOPE = null;

  function getCartScope() {
    if (CART_SCOPE) return CART_SCOPE;

    var selectors = [
      'form[action="/cart"]',
      'form[action^="/cart?"]',
      'form[action*="/cart/update"]',
      ".cart__items",
      ".cart-items"
    ];

    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) {
        CART_SCOPE = el;
        log("Using cart scope:", selectors[i], el);
        return CART_SCOPE;
      }
    }

    CART_SCOPE = document;
    log("Falling back to document as cart scope");
    return CART_SCOPE;
  }

  function isInsideDrawerOrMenu(el) {
    if (!el || !el.closest) return false;
    return !!el.closest(
      ".menu-drawer, .menu-drawer__inner-container, .drawer, [data-predictive-search]"
    );
  }

  // Find the DOM row for a given cart item (using multiple strategies)
  function findCartRowForItem(item) {
    if (!item) return null;

    var root = getCartScope();
    var key = item.key;
    var variantId = item.variant_id;
    var handle = item.handle;

    // 1) data-cart-item-key (Dawn-style)
    if (key) {
      var dataEl = root.querySelector(
        '[data-cart-item-key="' + key + '"]'
      );
      if (dataEl && dataEl.closest) {
        var row1 = dataEl.closest(
          ".cart-item, .cart__row, li, tr, .cart-item__row, .cart-line-item"
        );
        if (row1 && !isInsideDrawerOrMenu(row1)) {
          log("Found row via data-cart-item-key", key, row1);
          return row1;
        }
      }
    }

    // 2) hidden input with variant id (very common)
    if (variantId) {
      var variantSelectors = [
        'input[name="id[]"][value="' + variantId + '"]',
        'input[name="id"][value="' + variantId + '"]',
        '[data-variant-id="' + variantId + '"]'
      ];
      for (var i = 0; i < variantSelectors.length; i++) {
        var el = root.querySelector(variantSelectors[i]);
        if (el && el.closest) {
          var row2 = el.closest(
            ".cart-item, .cart__row, li, tr, .cart-item__row, .cart-line-item"
          );
          if (row2 && !isInsideDrawerOrMenu(row2)) {
            log("Found row via variant id", variantId, row2);
            return row2;
          }
        }
      }
    }

    // 3) Fall back to a link with product URL / handle WITHIN cart scope
    if (item.url || handle) {
      var selectorParts = [];
      if (item.url) selectorParts.push('a[href="' + item.url + '"]');
      if (handle)
        selectorParts.push('a[href*="/products/' + handle + '"]');

      if (selectorParts.length) {
        var links = root.querySelectorAll(selectorParts.join(","));
        for (var j = 0; j < links.length; j++) {
          var row3 = links[j].closest(
            ".cart-item, .cart__row, li, tr, .cart-item__row, .cart-line-item"
          );
          if (row3 && !isInsideDrawerOrMenu(row3)) {
            log("Found row via URL/handle", item.url || handle, row3);
            return row3;
          }
        }
      }
    }

    log("No row found for item", item);
    return null;
  }

  // Find the quantity input inside a cart row
  function findQtyInputInRow(row) {
    if (!row) return null;

    var selectors = [
      'input[name="updates[]"]',
      'input[name^="updates["]',
      'input[data-quantity-input]',
      'input[type="number"]'
    ];

    for (var i = 0; i < selectors.length; i++) {
      var input = row.querySelector(selectors[i]);
      if (input) return input;
    }

    return null;
  }

  // Where to place the toggle in the header row
  function findTitleArea(row) {
    if (!row) return null;
    return (
      row.querySelector(
        ".cart-item__name, .cart__product-name, .product__description, .cart-item-title"
      ) || row.firstElementChild
    );
  }

  // ------------- main logic -------------

  function initSmartBundlesCart() {
    if (!/\/cart(\/|$|\?|#)/.test(window.location.pathname)) {
      log("Not on cart page, aborting");
      return;
    }

    log("Initialising on cart page:", window.location.pathname);
    injectCartStyles();

    fetch("/cart.js", { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) {
          throw new Error("Failed to load cart.js: " + r.status);
        }
        return r.json();
      })
      .then(function (cart) {
        log("cart.js loaded", cart);
        buildCartBundles(cart);
      })
      .catch(function (err) {
        console.error("[Smart Bundles Cart] Error initialising:", err);
      });
  }

  function buildCartBundles(cart) {
    if (!cart || !Array.isArray(cart.items)) {
      log("No cart items, aborting");
      return;
    }

    // Group items by _bundle_key
    var bundles = {}; // { key: [{ item }] }

    cart.items.forEach(function (item) {
      if (!item || !item.properties) return;
      var bundleKey = item.properties._bundle_key;
      if (!bundleKey) return;

      if (!bundles[bundleKey]) {
        bundles[bundleKey] = [];
      }
      bundles[bundleKey].push({ item: item });
    });

    var bundleKeys = Object.keys(bundles);
    log("Found bundle groups:", bundleKeys);

    if (!bundleKeys.length) return;

    bundleKeys.forEach(function (bundleKey) {
      var group = bundles[bundleKey];
      if (!group || group.length === 0) return;

      // Try to find DOM rows for each item
      var rows = group
        .map(function (entry) {
          var row = findCartRowForItem(entry.item);
          return row
            ? {
                row: row,
                item: entry.item
              }
            : null;
        })
        .filter(function (x) {
          return x !== null;
        });

      if (!rows.length) {
        log("No DOM rows found for bundle", bundleKey);
        return;
      }

      // Sort rows by DOM position
      rows.sort(function (a, b) {
        if (a.row === b.row) return 0;
        var pos = a.row.compareDocumentPosition(b.row);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });

      var header = rows[0];
      var children = rows.slice(1);

      // ----- make header row represent the whole bundle -----

      var headerItem = header.item;

      // 1) Bundle title (from line item properties if available)
      var bundleTitle =
        (headerItem.properties && headerItem.properties.Bundle) ||
        headerItem.product_title ||
        headerItem.title ||
        "Bundle";

      // 2) Bundle total = sum of all line prices in this group
      var bundleTotalCents = rows.reduce(function (sum, r) {
        var it = r.item;
        var cents =
          it.final_line_price != null
            ? it.final_line_price
            : it.line_price != null
            ? it.line_price
            : 0;

        var parsed = parseInt(cents, 10);
        if (isNaN(parsed)) parsed = 0;
        return sum + parsed;
      }, 0);

      // 3) Update header row title
      var nameContainer = findTitleArea(header.row);
      if (nameContainer) {
        nameContainer.textContent = "Bundle: " + bundleTitle;
      }

      // 4) Update header row price to show bundle total
      var priceEl =
        header.row.querySelector(
          ".cart-item__total-price, .cart-item__price, .cart__price, [data-cart-item-line-price]"
        ) || header.row.querySelector(".cart__price-wrapper, .cart-price");

      if (priceEl) {
        priceEl.textContent = formatMoney(bundleTotalCents);
      }

      // 5) Hide meta (Bundle / Component) on the header row only
      var metaEl = header.row.querySelector(
        ".cart-item__meta, .cart__meta-text, .product__description-list"
      );
      if (metaEl) {
        metaEl.style.display = "none";
      }

      // ----- wrapper + accordion -----

      var wrapper = document.createElement("div");
      wrapper.className = "sb-cart-bundle";
      var parentNode = header.row.parentNode;

      if (!parentNode) return;
      parentNode.insertBefore(wrapper, header.row);

      // Move all rows into wrapper
      rows.forEach(function (r) {
        wrapper.appendChild(r.row);
      });

      header.row.classList.add("sb-cart-bundle-header");
      children.forEach(function (r) {
        r.row.classList.add("sb-cart-bundle-item");
      });

      // Add accordion toggle
      var titleArea = findTitleArea(header.row);
      if (titleArea) {
        var toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "sb-cart-bundle-toggle";
        var childCount = children.length;
        toggle.setAttribute("aria-expanded", "false");
        toggle.textContent =
          "Show bundle items" + (childCount ? " (" + childCount + ")" : "");

        toggle.addEventListener("click", function () {
          var expanded = toggle.getAttribute("aria-expanded") === "true";
          var next = !expanded;
          toggle.setAttribute("aria-expanded", next ? "true" : "false");
          wrapper.classList.toggle("sb-cart-bundle--open", next);
          toggle.textContent =
            (next ? "Hide" : "Show") +
            " bundle items" +
            (childCount ? " (" + childCount + ")" : "");
        });

        titleArea.appendChild(toggle);
      }

      // Quantity sync: keep children in ratio to header quantity
      var headerQtyInput = findQtyInputInRow(header.row);
      if (headerQtyInput) {
        var headerQtyInitial = header.item.quantity || 1;
        var multipliers = children.map(function (r) {
          var childQtyInitial = r.item.quantity || 1;
          var m =
            headerQtyInitial > 0
              ? childQtyInitial / headerQtyInitial
              : 1;
          return isFinite(m) && m > 0 ? m : 1;
        });

        headerQtyInput.addEventListener("change", function () {
          var newHeaderQty = parseInt(headerQtyInput.value, 10);
          if (isNaN(newHeaderQty) || newHeaderQty < 0) return;

          children.forEach(function (r, idx) {
            var input = findQtyInputInRow(r.row);
            if (!input) return;
            var m = multipliers[idx] || 1;
            var target = Math.round(newHeaderQty * m);
            if (target < 0) target = 0;
            input.value = String(target);
          });

          log("Synced child quantities for bundle", bundleKey);
          // Theme handles the actual form submit / cart update.
        });
      }
    });
  }

  onReady(function () {
    // Enable debug logs if needed:
    window.SB_CART_DEBUG = true;
    initSmartBundlesCart();
  });
})();
