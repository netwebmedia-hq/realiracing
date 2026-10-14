/* RealIRacing setup packs: single go-live switch.
   Flip PACKS_LIVE to true ONLY after Carlos has set CAT_SIMRACE_*_USD in
   netwebmedia's api-php/routes/catalogue.php AND the matching usd values in
   checkout.html. While false, buy buttons stay "notify me" mailto links. */
(function () {
  var PACKS_LIVE = true;
  if (!PACKS_LIVE) return;
  var b = document.getElementById('pack-buy');
  if (b && b.getAttribute('data-pack-url')) {
    b.href = b.getAttribute('data-pack-url');
    b.textContent = 'Buy the pack';
  }
  // Per-page price via data-price on #pack-buy (NWM PitStop is $29); setup packs default to $19.
  var price = (b && b.getAttribute('data-price')) || '19';
  var n = document.getElementById('pack-price-note');
  if (n) n.textContent = '$' + price + (price === '19' ? '' : ' one-time') + ' · Instant email delivery. 7-day money-back guarantee.';
})();
