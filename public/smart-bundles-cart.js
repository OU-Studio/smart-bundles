(function () {
  // ------------- small helpers -------------

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

      /* Common cart row types */
      .sb-cart-bundle .cart__row,
      .sb-cart-bundle .cart-item,
      .sb-cart-bundle li {
        border: none;
      }

      .sb-cart-bundle-header .cart-item__name::before,
      .sb-cart-bundle-header .cart__product-name::before {
        content: "Bundle: ";
        font-weight: 600;
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

  // Find the DOM row for a given cart item key
  function findCartRowByKey(itemKey) {
    if (!itemKey) return null;

    // Most themes either have data-cart-item-key or a hidden input with name="id[]"
    var hidden = document.querySelector(
      'input[name="id[]"][value="' + itemKey + '"]'
    );
    var row = null;

    if (hidden && hidden.closest) {
      row = hidden.closest(
        ".cart-item, .cart__row, li, tr, .cart-item__row, .cart-line-item"
      );
    }

    if (!row) {
      var dataEl = document.querySelector(
        '[data-cart-item-key="' + itemKey + '"]'
      );
      if (dataEl && dataEl.closest) {
        row = dataEl.closest(
          ".cart-item, .cart__row, li, tr, .cart-item__row, .cart-line-item"
        );
      }
    }

    return row || null;
  }

  // Find the quantity input inside a cart row
  function findQtyInputInRow(row) {
    if (!row) return null;

    var selectors = [
      'input[name="updates[]"]',
      'input[name^="updates["]',
      'input[data-quantity-input]',
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
    // Only run on cart pages
    if (!/\/cart(\/|$|\?|#)/.test(window.location.pathname)) {
      return;
    }

    injectCartStyles();

    fetch("/cart.js", { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) {
          throw new Error("Failed to load cart.js: " + r.status);
        }
        return r.json();
      })
      .then(function (cart) {
        buildCartBundles(cart);
      })
      .catch(function (err) {
        console.error("[Smart Bundles Cart] Error initialising:", err);
      });
  }

  function buildCartBundles(cart) {
    if (!cart || !Array.isArray(cart.items)) return;

    // Group items by _bundle_key
    var bundles = {}; // { key: [{ item, index }] }

    cart.items.forEach(function (item, idx) {
      if (!item || !item.properties) return;
      var bundleKey = item.properties._bundle_key;
      if (!bundleKey) return;

      if (!bundles[bundleKey]) {
        bundles[bundleKey] = [];
      }
      bundles[bundleKey].push({
        item: item,
        index: idx,
      });
    });

    Object.keys(bundles).forEach(function (bundleKey) {
      var group = bundles[bundleKey];
      if (!group || group.length === 0) return;

      // Try to find DOM rows for each item
      var rows = group
        .map(function (entry) {
          var row = findCartRowByKey(entry.item.key);
          return row
            ? {
                row: row,
                item: entry.item,
              }
            : null;
        })
        .filter(function (x) {
          return x !== null;
        });

      if (!rows.length) return;

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

      // Create wrapper
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
        // Compute initial multipliers: childQty = headerQty * multiplier
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

          // Let the theme handle the "Update cart" submit.
          // Some themes auto-submit on change; others need a manual click.
        });
      }
    });
  }

  onReady(initSmartBundlesCart);
})();
