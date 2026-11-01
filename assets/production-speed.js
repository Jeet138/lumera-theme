/*
  Production speed (Standard / Express) on the product page, see snippets/production-speed.liquid.

  - Shows "Ships by" dates counted in working days from today (after the cut-off hour, from tomorrow).
  - Standard: the theme adds the ring as usual, with the speed and date as line item properties.
  - Express: the ring and its "Express service charge" variant are added in one request,
    linked by _express_id; the charge line notes which ring it is for.
  - Cart: after every cart refresh the charge follows its ring (same quantity, removed with it,
    added back if only the charge was removed).
*/
(function () {
  'use strict';

  var root = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';

  function workingDaysFromNow(days, skipWeekends, cutoffHour) {
    var d = new Date();
    if (d.getHours() >= cutoffHour) d.setDate(d.getDate() + 1);
    var added = 0;
    while (added < days) {
      d.setDate(d.getDate() + 1);
      if (!skipWeekends || (d.getDay() !== 0 && d.getDay() !== 6)) added++;
    }
    return d;
  }

  function postJSON(url, body) {
    return fetch(root + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw data;
        return data;
      });
    });
  }

  function refreshCart() {
    if (document.body.classList.contains('template-cart')) return location.reload();
    if (window.theme && theme.miniCart) {
      theme.miniCart.updateElements();
      theme.miniCart.generateCart();
    }
  }

  /* ---------- Product page ---------- */

  if (!customElements.get('production-speed')) {
    customElements.define('production-speed', class extends HTMLElement {
      connectedCallback() {
        var ds = this.dataset;
        var skip = ds.skipWeekends === 'true';
        var cutoff = parseInt(ds.cutoffHour, 10) || 24;
        var fmt = new Intl.DateTimeFormat(ds.locale || undefined, { month: 'short', day: 'numeric' });

        this.dates = {
          standard: fmt.format(workingDaysFromNow(parseInt(ds.standardDays, 10) || 0, skip, cutoff)),
          express: fmt.format(workingDaysFromNow(parseInt(ds.expressDays, 10) || 0, skip, cutoff))
        };
        this.querySelector('[data-date="standard"]').textContent = ds.shipsBy + ' ' + this.dates.standard;
        this.querySelector('[data-date="express"]').textContent = ds.shipsBy + ' ' + this.dates.express;

        this.addEventListener('change', this.update.bind(this));
        this.update();
      }

      get form() {
        return document.getElementById(this.dataset.form);
      }

      get isExpress() {
        var checked = this.querySelector('.ps__radio:checked');
        return !!checked && checked.value === 'express';
      }

      update() {
        var key = this.isExpress ? 'express' : 'standard';
        var label = this.querySelector('.ps__radio[value="' + key + '"] + .ps__card .ps__name').textContent.trim();
        this.querySelector('[data-summary]').textContent = label + ' · ' + this.dataset.shipsBy + ' ' + this.dates[key];
        this.querySelector('[data-prop="speed"]').value = label;
        this.querySelector('[data-prop="date"]').value = this.dates[key];
        if (this.form) this.form.classList.toggle('ps-express', this.isExpress);
      }
    });
  }

  /* Express: replace the theme's single-item add with ring + charge in one request.
     Runs in the capture phase, after the theme's option validation and before its own submit handler. */
  document.addEventListener('submit', function (event) {
    var form = event.target;
    var formId = form.getAttribute('id'); // not form.id: the product form has a field named "id"
    if (!formId) return;
    var picker = document.querySelector('production-speed[data-form="' + formId + '"]');
    if (!picker || !picker.isExpress) return;

    event.preventDefault();
    event.stopPropagation();

    var data = new FormData(form);
    var expressId = 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var chargeVariant = picker.dataset.expressVariant;
    var ring = { id: data.get('id'), quantity: parseInt(data.get('quantity'), 10) || 1, properties: {} };
    data.forEach(function (value, name) {
      var match = name.match(/^properties\[(.+)\]$/);
      if (match && typeof value === 'string' && value !== '') ring.properties[match[1]] = value;
    });
    ring.properties._express_id = expressId;
    ring.properties._express_variant = chargeVariant;

    var charge = {
      id: chargeVariant,
      quantity: ring.quantity,
      properties: { For: picker.dataset.productTitle, _express_id: expressId, _express_fee: '1' }
    };

    var button = form.querySelector('[type="submit"]');
    if (button) button.classList.add('is-loading');

    // The cart lists the last added line first: add the charge first so it shows under its ring
    postJSON('cart/add.js', { items: [charge, ring] })
      .then(function (res) {
        var ringItem = res.items && res.items.filter(function (item) { return !item.properties._express_fee; })[0];
        if (window.AjaxCart && ringItem) {
          window.AjaxCart.prototype.success.call({ showNotice: form.classList.contains('js-form--notice') }, ringItem);
        } else {
          location.href = root + 'cart';
        }
      })
      .catch(function (err) {
        var message = (err && (err.description || err.message)) || 'Could not add to cart';
        if (window.theme && theme.alert) theme.alert.new('', message, 3000, 'warning');
        else console.error(message);
      })
      .then(function () {
        if (button) button.classList.remove('is-loading');
      });
  }, true);

  /* ---------- Cart: keep each Express charge in step with its ring ---------- */

  var fixes = 0;
  var busy = false; // the theme loads the cart twice per refresh: only one fix at a time

  /* Uses the cart the theme just loaded when given one; fetches it otherwise. */
  function syncExpressFees(cart) {
    if (busy) return Promise.resolve();
    var load = cart ? Promise.resolve(cart) : fetch(root + 'cart.js', { headers: { Accept: 'application/json' } }).then(function (res) { return res.json(); });
    return load
      .then(function (cart) {
        var rings = {};
        var fees = {};
        cart.items.forEach(function (item) {
          var p = item.properties || {};
          if (!p._express_id) return;
          if (p._express_fee) {
            fees[p._express_id] = item;
          } else {
            var r = rings[p._express_id] || (rings[p._express_id] = { quantity: 0, variant: p._express_variant, title: item.product_title });
            r.quantity += item.quantity;
          }
        });

        var updates = {};
        var adds = [];
        Object.keys(fees).forEach(function (id) {
          var want = rings[id] ? rings[id].quantity : 0;
          if (fees[id].quantity !== want) updates[fees[id].key] = want;
        });
        Object.keys(rings).forEach(function (id) {
          if (!fees[id] && rings[id].variant) {
            adds.push({ id: rings[id].variant, quantity: rings[id].quantity, properties: { For: rings[id].title, _express_id: id, _express_fee: '1' } });
          }
        });

        if (!Object.keys(updates).length && !adds.length) {
          fixes = 0;
          return;
        }
        if (++fixes > 2) return; // something keeps failing: don't loop

        busy = true;
        var steps = Promise.resolve();
        if (Object.keys(updates).length) steps = steps.then(function () { return postJSON('cart/update.js', { updates: updates }); });
        if (adds.length) steps = steps.then(function () { return postJSON('cart/add.js', { items: adds }); });
        return steps.then(function () {
          busy = false;
          refreshCart();
        }, function (err) {
          busy = false;
          throw err;
        });
      })
      .catch(function (err) {
        console.error('Express charge sync', err);
      });
  }

  /* The mini cart loads the cart through Shopify.getCart after every change: check that same cart,
     so no extra request is made unless a charge needs fixing. */
  function hookCart() {
    if (window.Shopify && typeof Shopify.getCart === 'function') {
      if (Shopify.getCart.__expressSync) return;
      var getCart = Shopify.getCart;
      Shopify.getCart = function (callback) {
        return getCart.call(this, function (cart) {
          if (callback) callback(cart);
          syncExpressFees(cart);
        });
      };
      Shopify.getCart.__expressSync = true;
    } else if (window.theme && theme.miniCart && !theme.miniCart.__expressSync) {
      var update = theme.miniCart.updateElements;
      theme.miniCart.updateElements = function () {
        var result = update.apply(this, arguments);
        syncExpressFees();
        return result;
      };
      theme.miniCart.__expressSync = true;
    }
  }

  hookCart();
  if (document.body.classList.contains('template-cart')) syncExpressFees();
})();
