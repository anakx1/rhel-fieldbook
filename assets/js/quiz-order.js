/* ==========================================================================
   RHEL Fieldbook — deterministic quiz option order
   Options are shuffled at render time with a stable seed per question.
   Stored answers always refer to the original option index in the data.
   ========================================================================== */

(function () {
  'use strict';

  var RHEL = window.RHEL;
  if (!RHEL) return;

  /* Salt chosen so the rendered correct-answer positions stay balanced.
     Changing it changes the display order, so re-run the content validator. */
  var SALT = 'rhel-fieldbook-quiz-v3-10';

  function hash(text) {
    var h = 2166136261;
    text = String(text);
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function random(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function orderFor(lessonId, questionIndex, question) {
    var length = question && question.options ? question.options.length : 0;
    var order = [];
    for (var i = 0; i < length; i++) order.push(i);
    if (length < 2) return order;

    var seed = hash(SALT + '|' + lessonId + '|' + questionIndex + '|' + (question.q || ''));
    var rand = random(seed);
    for (var j = length - 1; j > 0; j--) {
      var k = Math.floor(rand() * (j + 1));
      var tmp = order[j];
      order[j] = order[k];
      order[k] = tmp;
    }
    return order;
  }

  RHEL.quizOrder = orderFor;
})();
