(function () {
  function initSmartBundlesCart() {
    // Only run on cart pages
    var path = window.location.pathname || "";
    if (path.indexOf("/cart") !== 0) return;

    var cartForm = document.querySelector('form[action*="/cart"]');
    if (!cartForm) return;

    var shopCurrency =
      document.documentElement.getAttribute("data-shop-currency") || "GBP";

    function formatMoney(cents) {
      var n = (cents || 0) / 100;
      try {
        return n.toLocaleString(undefined, {
          style: "currency",
          currency: shopCurrency || "GBP",
        });
      } catch (e) {
        return "£" + n.toFixed(2);
      }
    }

    fetch("/cart.js")
      .then(function (res) {
        if (!res.ok) throw new Error("cart.js failed: " + res.status);
        return res.json();
      })
      .then(function (cartJson) {
        var items = Array.isArray(cartJson.items) ? cartJson.items : [];
        if (!items.length) return;

        // Find all quantity inputs in the cart form and map to rows in DOM order
        var qtyInputs = Array.prototype.slice.call(
          cartForm.querySelectorAll('input[type="number"][name*="updates"]')
        );
        if (!qtyInputs.length) return;

        var rows = qtyInputs.map(function (input) {
          return (
            input.closest("tr") ||
            input.closest(".cart-item") ||
            input.closest("li") ||
            input.closest("div")
          );
        });

        // Map index -> { item, row }, then group by _bundle_key
        var groups = {}; // bundleKey -> array of { item, row, qtyInput }

        items.forEach(function (item, index) {
          var row = rows[index];
          if (!row) return;

          var props = item.properties || {};
          var bundleKey = props._bundle_key;
          if (!bundleKey) return;

          if (!groups[bundleKey]) groups[bundleKey] = [];
          groups[bundleKey].push({
            item: item,
            row: row,
            qtyInput: qtyInputs[index],
          });
        });

        // Helper to inject "Part of bundle" label
        function insertBundleLabel(row, bundleName) {
          var detailsCell =
            row.querySelector(".cart-item__details") || row;
          var label = document.createElement("p");
          label.className = "sb-cart-bundle-label";
          label.textContent = "Part of " + bundleName;

          var titleLink =
            detailsCell.querySelector("a") || detailsCell.firstChild;

          if (titleLink && titleLink.parentNode === detailsCell) {
            detailsCell.insertBefore(label, titleLink);
          } else {
            detailsCell.insertBefore(label, detailsCell.firstChild);
          }
          return label;
        }

        // Helper to find a price element in a row (best effort)
        function findPriceElement(row) {
          return (
            row.querySelector("[data-cart-item-price]") ||
            row.querySelector("[data-cart-item-line-price]") ||
            row.querySelector(".cart-item__price .price") ||
            row.querySelector(".cart-item__price-wrapper .price") ||
            row.querySelector(".cart__price .price") ||
            row.querySelector(".price")
          );
        }

        Object.keys(groups).forEach(function (bundleKey) {
          var group = groups[bundleKey];
          if (!group.length) return;

          // Sort by DOM order just to be safe
          group.sort(function (a, b) {
            return a.row.compareDocumentPosition(b.row) &
              Node.DOCUMENT_POSITION_FOLLOWING
              ? -1
              : 1;
          });

          var parent = group[0];
          var children = group.slice(1);

          var parentRow = parent.row;
          var parentInput = parent.qtyInput;
          if (!parentRow || !parentInput) return;

          parentRow.classList.add("sb-cart-bundle-parent");

          var bundleName =
            (parent.item.properties && parent.item.properties.Bundle) ||
            "bundle";

          // ----- Label + accordion button -----
          var label = insertBundleLabel(parentRow, bundleName);

          var toggleBtn = document.createElement("button");
          toggleBtn.type = "button";
          toggleBtn.className = "sb-cart-bundle-toggle";
          toggleBtn.setAttribute("aria-expanded", "false");
          toggleBtn.textContent = "Show bundle items";
          label.parentNode.insertBefore(toggleBtn, label.nextSibling);

          // ----- Hide child rows and some UI -----
          children.forEach(function (child) {
            var row = child.row;
            if (!row) return;

            row.classList.add("sb-cart-bundle-child");

            var priceCell =
              row.querySelector(".cart-item__prices") ||
              row.querySelector(".cart__price");
            if (priceCell) priceCell.style.display = "none";

            var totalsCell =
              row.querySelector(".cart-item__totals") ||
              row.querySelector(".cart__final-price");
            if (totalsCell) totalsCell.style.display = "none";

            var qtyCell =
              row.querySelector(".cart-item__quantity") ||
              row.querySelector(".cart__quantity");
            if (qtyCell) qtyCell.style.display = "none";

            var removeCell =
              row.querySelector(".cart-item__remove") ||
              (function () {
                var link = row.querySelector('[href*="change?line"]');
                return link ? link.closest("td") : null;
              })();
            if (removeCell) removeCell.style.display = "none";

            row.style.display = "none"; // collapsed by default
          });

          // ----- Compute bundle unit price from cart JSON -----
          var bundleUnitPrice = 0;
          group.forEach(function (entry) {
            bundleUnitPrice += entry.item.price; // cents
          });

          var parentQty = parent.item.quantity || 1;
          parentInput.value = parentQty;
          var bundleTotal = bundleUnitPrice * parentQty;

          // Override price + total display on parent row
          var parentPriceEl = findPriceElement(parentRow);
          if (parentPriceEl) {
            parentPriceEl.textContent = formatMoney(bundleUnitPrice);
          }

          var parentTotalsEl =
            parentRow.querySelector("[data-cart-item-line-price]") ||
            parentRow.querySelector(".cart-item__totals .price") ||
            parentPriceEl;
          if (parentTotalsEl) {
            parentTotalsEl.textContent = formatMoney(bundleTotal);
          }

          // ----- Remove bundle (sets all qty to 0 and submits) -----
          var removeCellParent =
            parentRow.querySelector(".cart-item__remove") ||
            (function () {
              var link = parentRow.querySelector('[href*="change?line"]');
              return link ? link.closest("td") : null;
            })();

          if (removeCellParent) {
            var existingLink = removeCellParent.querySelector("a");
            if (existingLink) existingLink.style.display = "none";

            var removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "sb-cart-bundle-remove";
            removeBtn.textContent = "Remove bundle";
            removeCellParent.appendChild(removeBtn);

            removeBtn.addEventListener("click", function () {
              group.forEach(function (entry) {
                if (!entry.qtyInput) return;
                entry.qtyInput.value = 0;
              });
              cartForm.submit();
            });
          }

          // ----- Sync quantity for whole bundle -----
          parentInput.addEventListener("change", function () {
            var newQty = parseInt(parentInput.value, 10);
            if (isNaN(newQty) || newQty < 1) newQty = 1;
            parentInput.value = newQty;

            children.forEach(function (entry) {
              if (entry.qtyInput) {
                entry.qtyInput.value = newQty;
              }
            });

            var newTotal = bundleUnitPrice * newQty;
            if (parentTotalsEl) {
              parentTotalsEl.textContent = formatMoney(newTotal);
            }

            cartForm.submit();
          });

          // ----- Accordion toggle behaviour -----
          toggleBtn.addEventListener("click", function () {
            var expanded = this.getAttribute("aria-expanded") === "true";
            var newExpanded = !expanded;
            this.setAttribute("aria-expanded", newExpanded ? "true" : "false");
            this.textContent = newExpanded
              ? "Hide bundle items"
              : "Show bundle items";

            children.forEach(function (entry) {
              if (entry.row) {
                entry.row.style.display = newExpanded ? "" : "none";
              }
            });
          });
        });
      })
      .catch(function (err) {
        console.error("[Smart Bundles cart]", err);
      });
  }

  document.addEventListener("DOMContentLoaded", initSmartBundlesCart);
})();
