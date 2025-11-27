(function () {
  // ----------------- small helpers -----------------

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
        display: table-row;
      }

      /* list-style carts */
      .sb-cart-bundle.sb-cart-bundle--open .sb-cart-bundle-item.sqs-li,
      .sb-cart-bundle.sb-cart-bundle--open li.sb-cart-bundle-item {
        display: list-item;
      }

      .sb-cart-bundle .cart-item,
      .sb-cart-bundle .cart__row,
      .sb-cart-bundle li,
      .sb-cart-bundle tr,
      .sb-cart-bundle .cart-line-item {
        border: none;
      }

      .sb-cart-bundle-item .cart-items__media {
        visibility: hidden;
      }

      .sb-cart-bundle-item .cart-items__title {
        padding-left: 1.25rem;
        position: relative;
        display: inline-block;
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

  // --------- cart scope (avoid header/drawers) ----------

  var CART_SCOPE = null;

  function getCartScope() {
    if (CART_SCOPE) return CART_SCOPE;

    var selectors = [
      'form[action="/cart"]',
      'form[action^="/cart?"]',
      'form[action*="/cart/update"]',
      ".cart-items__wrapper",
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

  // ------------- row + qty helpers ----------------

  function findCartRowForItem(item) {
    if (!item) return null;

    var root = getCartScope();
    var key = item.key;
    var variantId = item.variant_id;
    var handle = item.handle;

    // 1) data-key / data-cart-item-key
    if (key) {
      var dataEl = root.querySelector(
        '[data-key="' +
          key +
          '"], [data-cart-item-key="' +
          key +
          '"]'
      );
      if (dataEl && dataEl.closest) {
        var row1 = dataEl.closest(
          ".cart-items__table-row, .cart-item, .cart__row, li, tr, .cart-line-item"
        );
        if (row1 && !isInsideDrawerOrMenu(row1)) {
          log("Found row via data-key", key, row1);
          return row1;
        }
      }
    }

    // 2) inputs with variant id
    if (variantId) {
      var variantSelectors = [
        'input[name="id[]"][value="' + variantId + '"]',
        'input[name="id"][value="' + variantId + '"]',
        '[data-variant-id="' + variantId + '"]'
      ];
      for (var i = 0; i < variantSelectors.length; i++) {
        var el2 = root.querySelector(variantSelectors[i]);
        if (el2 && el2.closest) {
          var row2 = el2.closest(
            ".cart-items__table-row, .cart-item, .cart__row, li, tr, .cart-line-item"
          );
          if (row2 && !isInsideDrawerOrMenu(row2)) {
            log("Found row via variant id", variantId, row2);
            return row2;
          }
        }
      }
    }

    // 3) URL/handle
    if (item.url || handle) {
      var selectorParts = [];
      if (item.url) selectorParts.push('a[href="' + item.url + '"]');
      if (handle) selectorParts.push('a[href*="/products/' + handle + '"]');

      if (selectorParts.length) {
        var links = root.querySelectorAll(selectorParts.join(","));
        for (var j = 0; j < links.length; j++) {
          var row3 = links[j].closest(
            ".cart-items__table-row, .cart-item, .cart__row, li, tr, .cart-line-item"
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

  function findTitleArea(row) {
    if (!row) return null;
    return (
      row.querySelector(
        ".cart-items__details, .cart-item__details, .cart-item__name, .cart__product-name, .product__description, .cart-item-title"
      ) || row.firstElementChild
    );
  }

  // ------------------ main -------------------

  function initSmartBundlesCart() {
    if (!/\/cart(\/|$|\?|#)/.test(window.location.pathname)) {
      log("Not on cart page; abort");
      return;
    }

    injectStyles();
    log("Initialising on cart page");

    fetch("/cart.js", { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("cart.js failed " + r.status);
        return r.json();
      })
      .then(function (cart) {
        log("cart.js", cart);
        buildBundles(cart);
      })
      .catch(function (err) {
        console.error("[Smart Bundles Cart]", err);
      });
  }

  function buildBundles(cart) {
    if (!cart || !Array.isArray(cart.items)) return;

    var bundles = {};

    cart.items.forEach(function (item) {
      if (!item || !item.properties) return;
      var key = item.properties._bundle_key;
      if (!key) return;
      if (!bundles[key]) bundles[key] = [];
      bundles[key].push({ item: item });
    });

    var bundleKeys = Object.keys(bundles);
    log("Bundle groups:", bundleKeys);
    if (!bundleKeys.length) return;

    bundleKeys.forEach(function (bundleKey) {
      var group = bundles[bundleKey];
      if (!group || !group.length) return;

      // attach DOM rows
      var rows = group
        .map(function (entry) {
          var row = findCartRowForItem(entry.item);
          return row
            ? { item: entry.item, row: row }
            : null;
        })
        .filter(Boolean);

      if (!rows.length) {
        log("No DOM rows for bundle", bundleKey);
        return;
      }

      // sort by DOM order
      rows.sort(function (a, b) {
        if (a.row === b.row) return 0;
        var pos = a.row.compareDocumentPosition(b.row);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });

      var header = rows[0];
      var childrenReal = rows.slice(1);

      // clone header BEFORE modifying it – this will be our first child row
      var headerClone = header.row.cloneNode(true);

      // -------- bundle meta / sums ----------

      var bundleTitle =
        (header.item.properties && header.item.properties.Bundle) ||
        header.item.product_title ||
        header.item.title ||
        "Bundle";

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

      var headerInitialQty = header.item.quantity || 1;
      if (headerInitialQty < 1) headerInitialQty = 1;

      var bundleUnitPriceCents = headerInitialQty
        ? Math.round(bundleTotalCents / headerInitialQty)
        : bundleTotalCents;

      // ---------- wrapper + DOM placement -----------

      var parentNode = header.row.parentNode;
      if (!parentNode) return;

      var wrapper = document.createElement("div");
      wrapper.className = "sb-cart-bundle sb-cart-bundle--open";

      parentNode.insertBefore(wrapper, header.row);

      // move header row inside wrapper
      wrapper.appendChild(header.row);

      // insert clone and real children after header
      wrapper.appendChild(headerClone);
      childrenReal.forEach(function (c) {
        wrapper.appendChild(c.row);
      });

      // mark header + child classes
      header.row.classList.add("sb-cart-bundle-header");
      headerClone.classList.add("sb-cart-bundle-item");
      childrenReal.forEach(function (c) {
        c.row.classList.add("sb-cart-bundle-item");
      });

      // ---------- header row: make it the bundle summary ----------

      // title -> "Bundle: X"
      var titleLink =
        header.row.querySelector(".cart-items__title, .cart-item__name, .cart__product-name");
      if (titleLink) {
        titleLink.textContent = "Bundle: " + bundleTitle;
      }

      // hide variants + properties etc on header row
      var metaEls = header.row.querySelectorAll(
        ".cart-items__variants, .cart-items__variant, .cart-items__properties, .product-option, .cart-item__meta, .cart__meta-text, .product__description-list"
      );
      metaEls.forEach(function (el) {
        el.style.display = "none";
      });

      // Horizon-style per-line price that sits under title: show single-bundle price
      var headerDetails =
        header.row.querySelector(".cart-items__details, .cart-item__details");
      if (headerDetails) {
        var priceBlock = headerDetails.querySelector("div");
        if (priceBlock) {
          var span = priceBlock.querySelector("span:not(.visually-hidden)");
          if (span) {
            span.textContent = formatMoney(bundleUnitPriceCents);
          }
        }
      }

      // overwrite total cell with bundle total (price * qty)
      var priceCell =
        header.row.querySelector(
          ".cart-item__total-price, .cart-item__price, .cart__price, td.cart-items__price [data-cart-item-line-price], td.cart-items__price, [data-cart-item-line-price]"
        ) || header.row.querySelector(".cart__price-wrapper, .cart-price");

      if (priceCell) {
        if (priceCell.tagName && priceCell.tagName.toLowerCase() === "td") {
          var textComp = priceCell.querySelector("text-component");
          if (textComp) {
            textComp.textContent = formatMoney(bundleTotalCents);
            textComp.setAttribute("value", formatMoney(bundleTotalCents));
          } else {
            priceCell.textContent = formatMoney(bundleTotalCents);
          }
        } else {
          priceCell.textContent = formatMoney(bundleTotalCents);
        }
      }

      // ---------- toggle (accordion) ----------

      var titleArea =
        header.row.querySelector(".cart-items__details, .cart-item__details") ||
        findTitleArea(header.row);

      var childCount = rows.length; // REAL items count

      if (titleArea) {
        var toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "sb-cart-bundle-toggle";
        toggle.setAttribute("aria-expanded", "true");
        toggle.textContent =
          "Hide bundle items" + (childCount ? " (" + childCount + ")" : "");

        toggle.addEventListener("click", function () {
          var expanded = toggle.getAttribute("aria-expanded") === "true";
          var next = !expanded;
          toggle.setAttribute("aria-expanded", next ? "true" : "false");
          wrapper.classList.toggle("sb-cart-bundle--open", next);
          toggle.textContent =
            (next ? "Hide" : "Show") +
            " bundle items" +
            (childCount ? " (" + childCount + ")" : "");

          var childRows =
            wrapper.querySelectorAll(".sb-cart-bundle-item");
          childRows.forEach(function (r) {
            r.style.display = next ? "" : "none";
          });
        });

        titleArea.appendChild(toggle);
      }

      // ---------- shared child-row decoration (clone + real children) ----------

      function decorateChildRow(row) {
        if (!row) return;

        // hide prices / totals / qty / remove
        var prices = row.querySelector(".cart-item__prices, .cart-items__price");
        if (prices) prices.style.display = "none";

        var totals = row.querySelector(".cart-item__totals, [data-cart-item-line-price]");
        if (totals) totals.style.display = "none";

        var qtyCell = row.querySelector(".cart-item__quantity, .cart-items__quantity");
        if (qtyCell) qtyCell.style.display = "none";

        var removeCell = row.querySelector(".cart-item__remove");
        if (removeCell) removeCell.style.display = "none";

        // disable any quantity inputs so they don't submit
        var qtyInput = findQtyInputInRow(row);
        if (qtyInput) {
          qtyInput.setAttribute("data-sb-disabled", "true");
          qtyInput.disabled = true;
          qtyInput.removeAttribute("name");
        }
      }

      decorateChildRow(headerClone);
      childrenReal.forEach(function (c) {
        decorateChildRow(c.row);
      });

      // initially open – show all bundle items
      var allChildRows = wrapper.querySelectorAll(".sb-cart-bundle-item");
      allChildRows.forEach(function (r) {
        r.style.display = "";
      });

      // ---------- quantity sync (header -> real bundle items) ----------

      var headerQtyInput = findQtyInputInRow(header.row);
      if (headerQtyInput) {
        var multipliers = childrenReal.map(function (c) {
          var childInitial = c.item.quantity || 1;
          var m =
            headerInitialQty > 0
              ? childInitial / headerInitialQty
              : 1;
          return isFinite(m) && m > 0 ? m : 1;
        });

        headerQtyInput.addEventListener("change", function () {
          var newQty = parseInt(headerQtyInput.value, 10);
          if (isNaN(newQty) || newQty < 1) newQty = 1;
          headerQtyInput.value = newQty;

          // update child row inputs
          childrenReal.forEach(function (c, idx) {
            var rowInput = findQtyInputInRow(c.row);
            if (!rowInput) return;
            var mult = multipliers[idx] || 1;
            var target = Math.round(newQty * mult);
            if (target < 1) target = 1;
            rowInput.value = String(target);
          });

          // submit the form (theme-cart form) so Shopify updates everything
          var cartForm = header.row.closest('form[action^="/cart"]');
          if (cartForm) {
            cartForm.submit();
          }
        });
      }

      // ---------- remove button = remove whole bundle ----------

      var allRealRows = [header].concat(childrenReal);
      var cartFormForRemove = header.row.closest('form[action^="/cart"]');

      if (cartFormForRemove) {
        var removeButtons = header.row.querySelectorAll(
          ".cart-items__remove button, .cart-item__remove button, .cart-remove, a[href*='cart/change']"
        );

        removeButtons.forEach(function (btn) {
          btn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();

            allRealRows.forEach(function (entry) {
              var input = findQtyInputInRow(entry.row);
              if (input) {
                input.value = "0";
              }
            });

            cartFormForRemove.submit();
          });
        });
      }
    });
  }

  onReady(initSmartBundlesCart);
})();
