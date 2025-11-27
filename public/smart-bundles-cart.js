(function () {
  // ---------------- helpers ----------------

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function log() {
    if (!window.SB_CART_DEBUG) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift("[Smart Bundles Cart]");
    console.log.apply(console, args);
  }

  function injectStyles() {
    if (document.getElementById("sb-cart-bundle-styles")) return;
    var css = `
      .sb-cart-bundle-header {
        background: #f6f6f7;
      }

      .sb-cart-bundle-item {
        border-top: none;
      }

      .sb-cart-bundle-toggle {
        background: none;
        border: 0;
        padding: 0.25rem 0.75rem;
        border-radius: 999px;
        font-size: 0.8rem;
        border: 1px solid #d0d3d6;
        cursor: pointer;
        margin-top: 0.35rem;
      }

      .sb-cart-bundle-toggle:focus-visible {
        outline: 2px solid #000;
        outline-offset: 2px;
      }

      .sb-cart-bundle-item .cart-items__media {
        visibility: hidden;
      }

      .sb-cart-bundle-item .cart-items__title {
        padding-left: 1.25rem;
        position: relative;
      }

      .sb-cart-bundle-item .cart-items__title::before {
        content: "•";
        position: absolute;
        left: -1rem;
      }
    `;
    var style = document.createElement("style");
    style.id = "sb-cart-bundle-styles";
    style.textContent = css;
    document.head.appendChild(style);
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

  // ------------- row helpers -------------

  function getCartScope() {
    var form =
      document.querySelector('form[action="/cart"]') ||
      document.querySelector('form[action^="/cart?"]') ||
      document.querySelector(".cart-items__wrapper") ||
      document;
    return form;
  }

  function findCartRowForItem(item) {
    if (!item) return null;
    var scope = getCartScope();

    // 1) key
    if (item.key) {
      var el = scope.querySelector(
        '[data-key="' +
          item.key +
          '"], [data-cart-item-key="' +
          item.key +
          '"]'
      );
      if (el && el.closest) {
        return el.closest(
          ".cart-items__table-row, .cart-item, .cart__row, tr, li, .cart-line-item"
        );
      }
    }

    // 2) variant id
    if (item.variant_id) {
      var selectors = [
        'input[name="updates[]"][data-cart-line][value="' + item.quantity + '"][data-variant-id="' + item.variant_id + '"]',
        'input[data-variant-id="' + item.variant_id + '"]',
        'input[name="id"][value="' + item.variant_id + '"]',
        'input[name="id[]"][value="' + item.variant_id + '"]'
      ];
      for (var i = 0; i < selectors.length; i++) {
        var inEl = scope.querySelector(selectors[i]);
        if (inEl && inEl.closest) {
          return inEl.closest(
            ".cart-items__table-row, .cart-item, .cart__row, tr, li, .cart-line-item"
          );
        }
      }
    }

    // 3) URL / handle
    var handle = item.handle;
    if (item.url || handle) {
      var qs = [];
      if (item.url) qs.push('a[href="' + item.url + '"]');
      if (handle) qs.push('a[href*="/products/' + handle + '"]');
      if (qs.length) {
        var links = scope.querySelectorAll(qs.join(","));
        for (var j = 0; j < links.length; j++) {
          var row = links[j].closest(
            ".cart-items__table-row, .cart-item, .cart__row, tr, li, .cart-line-item"
          );
          if (row) return row;
        }
      }
    }

    return null;
  }

  function findQtyInput(row) {
    if (!row) return null;
    var sels = [
      'input[name="updates[]"]',
      'input[name^="updates["]',
      'input[data-quantity-input]',
      'input[type="number"]'
    ];
    for (var i = 0; i < sels.length; i++) {
      var input = row.querySelector(sels[i]);
      if (input) return input;
    }
    return null;
  }

  // ------------- main -------------

  function init() {
    if (!/\/cart(\/|$|\?|#)/.test(window.location.pathname)) return;
    injectStyles();
    log("Cart page detected, fetching cart.js");

    fetch("/cart.js", { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("cart.js " + r.status);
        return r.json();
      })
      .then(function (cart) {
        log("cart", cart);
        decorateBundles(cart);
      })
      .catch(function (e) {
        console.error("[Smart Bundles Cart]", e);
      });
  }

  function decorateBundles(cart) {
    if (!cart || !Array.isArray(cart.items)) return;

    var bundles = {};
    cart.items.forEach(function (item) {
      var props = item.properties || {};
      var key = props._bundle_key;
      if (!key) return;
      if (!bundles[key]) bundles[key] = [];
      bundles[key].push(item);
    });

    var bundleKeys = Object.keys(bundles);
    if (!bundleKeys.length) {
      log("No bundles found");
      return;
    }

    log("Bundles:", bundleKeys);

    var scope = getCartScope();
    var cartForm =
      scope.closest('form[action^="/cart"]') ||
      document.querySelector('form[action^="/cart"]');

    bundleKeys.forEach(function (bundleKey) {
      var items = bundles[bundleKey];

      // Map each item -> row
      var rows = items
        .map(function (item) {
          var row = findCartRowForItem(item);
          if (!row) return null;
          row.dataset.bundleKey = bundleKey;
          row.dataset.lineKey = item.key;
          return { item: item, row: row };
        })
        .filter(Boolean);

      if (!rows.length) return;

      // sort rows by DOM order to get stable parent
      rows.sort(function (a, b) {
        if (a.row === b.row) return 0;
        var pos = a.row.compareDocumentPosition(b.row);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });

      var parent = rows[0]; // bundle header row
      var children = rows.slice(1);

      log("Bundle", bundleKey, "rows:", rows);

      // mark classes
      parent.row.classList.add("sb-cart-bundle-header");
      children.forEach(function (c) {
        c.row.classList.add("sb-cart-bundle-item");
      });

      // ---------- toggle button ----------

      var detailsCell =
        parent.row.querySelector(".cart-items__details, .cart-item__details") ||
        parent.row;

      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "sb-cart-bundle-toggle";
      toggle.setAttribute("aria-expanded", "true");
      toggle.textContent =
        "Hide bundle items (" + children.length + ")";

      toggle.addEventListener("click", function () {
        var expanded = toggle.getAttribute("aria-expanded") === "true";
        var next = !expanded;
        toggle.setAttribute("aria-expanded", next ? "true" : "false");
        toggle.textContent =
          (next ? "Hide" : "Show") +
          " bundle items (" +
          children.length +
          ")";
        children.forEach(function (c) {
          c.row.style.display = next ? "" : "none";
        });
      });

      // put toggle under the title
      if (detailsCell) {
        detailsCell.appendChild(toggle);
      }

      // ---------- compute bundle prices ----------

      var bundleTitle =
        (parent.item.properties && parent.item.properties.Bundle) ||
        parent.item.product_title ||
        parent.item.title ||
        "Bundle";

      var totalCents = rows.reduce(function (sum, r) {
        var it = r.item;
        var cents =
          it.final_line_price != null
            ? it.final_line_price
            : it.line_price != null
            ? it.line_price
            : 0;
        return sum + (parseInt(cents, 10) || 0);
      }, 0);

      var parentQty = parent.item.quantity || 1;
      if (parentQty < 1) parentQty = 1;
      var unitCents = Math.round(totalCents / parentQty);

      // title -> "Bundle: X"
      var titleLink = parent.row.querySelector(
        ".cart-items__title, .cart-item__name, .cart__product-name"
      );
      if (titleLink) {
        titleLink.textContent = "Bundle: " + bundleTitle;
      }

      // hide variant/property detail on header
      var metaEls = parent.row.querySelectorAll(
        ".cart-items__variants, .cart-items__variant, .cart-items__properties, .product-option, .cart-item__meta, .product__description-list"
      );
      metaEls.forEach(function (el) {
        el.style.display = "none";
      });

      // small price under title (Horizon style)
      if (detailsCell) {
        var priceWrapper = detailsCell.querySelector("div");
        if (priceWrapper) {
          var span = priceWrapper.querySelector(
            "span:not(.visually-hidden)"
          );
          if (span) {
            span.textContent = formatMoney(unitCents);
          }
        }
      }

      // total on the right
      var totalCell =
        parent.row.querySelector(
          "td.cart-items__price text-component, td.cart-items__price, .cart-item__totals .price, [data-cart-item-line-price]"
        ) || parent.row.querySelector(".cart-items__price");

      if (totalCell) {
        if (totalCell.tagName === "TEXT-COMPONENT") {
          totalCell.textContent = formatMoney(totalCents);
          totalCell.setAttribute("value", formatMoney(totalCents));
        } else {
          totalCell.textContent = formatMoney(totalCents);
        }
      }

      // ---------- child decoration (hide price/qty/remove) ----------

      children.forEach(function (c) {
        var prices = c.row.querySelector(
          ".cart-item__prices, td.cart-items__price"
        );
        if (prices) prices.style.display = "none";

        var totals = c.row.querySelector(".cart-item__totals");
        if (totals) totals.style.display = "none";

        var qtyCell = c.row.querySelector(".cart-items__quantity, .cart-item__quantity");
        if (qtyCell) qtyCell.style.display = "none";

        var removeCell = c.row.querySelector(".cart-items__remove, .cart-item__remove");
        if (removeCell) removeCell.style.display = "none";
      });

      // ---------- quantity sync ----------

      var parentQtyInput = findQtyInput(parent.row);
      if (parentQtyInput && cartForm) {
        // how many of each child per 1 parent
        var childMultipliers = children.map(function (c) {
          var q = c.item.quantity || 1;
          return parentQty ? q / parentQty : 1;
        });

        parentQtyInput.addEventListener("change", function () {
          var newQty = parseInt(parentQtyInput.value, 10);
          if (isNaN(newQty) || newQty < 1) newQty = 1;
          parentQtyInput.value = newQty;

          children.forEach(function (c, idx) {
            var input = findQtyInput(c.row);
            if (!input) return;
            var mult = childMultipliers[idx] || 1;
            var childQty = Math.round(newQty * mult);
            if (childQty < 1) childQty = 1;
            input.value = childQty;
          });

          cartForm.submit();
        });
      }

      // ---------- remove whole bundle via header remove ----------

      if (cartForm) {
        var removeButtons = parent.row.querySelectorAll(
          ".cart-items__remove button, .cart-items__remove a, .cart-item__remove button, .cart-item__remove a"
        );
        removeButtons.forEach(function (btn) {
          btn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();

            // zero out every line in the bundle
            rows.forEach(function (r) {
              var input = findQtyInput(r.row);
              if (input) input.value = "0";
            });

            cartForm.submit();
          });
        });
      }
    });
  }

  onReady(init);
})();
