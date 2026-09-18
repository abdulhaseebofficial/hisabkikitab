/**
 * Feedback rules.
 *
 * The row is stored first and the e-mail attempted second, deliberately. With
 * no SMTP configured - the normal case - the mail hop fails, and a student who
 * took the trouble to write something should not lose it or see an error
 * because of that. `emailed` records which actually happened, so the rows can
 * be picked up later.
 */

const feedbackRepo = require('./feedback.repository');
const { sendMail } = require('../../infrastructure/email/mailer');
const { DEVELOPER, FEEDBACK_TYPES } = require('../../shared/constants');

const RECENT_LIMIT = 20;

/** Formats one note as the plain-text mail the developer receives. */
const asMail = (author, feedback) => ({
  to: DEVELOPER.email,
  subject: `Hisab Ki Kitab feedback: ${feedback.type}${
    feedback.rating ? ` (${feedback.rating}/5)` : ''
  }`,
  text: [
    `From: ${author.name} <${author.email}>`,
    `Type: ${feedback.type}`,
    feedback.rating ? `Rating: ${feedback.rating}/5` : null,
    feedback.page ? `Page: ${feedback.page}` : null,
    '',
    feedback.message,
  ]
    .filter((line) => line !== null)
    .join('\n'),
});

const submit = async (user, { type, rating, message, page }) => {
  let feedback = await feedbackRepo.create(user._id, { type, rating, message, page });

  try {
    const result = await sendMail(asMail(user, feedback));
    if (result.delivered) {
      feedback = await feedbackRepo.markEmailed(feedback._id);
    }
  } catch (err) {
    // Logged, never surfaced - the feedback itself was already stored.
    console.error('[feedback] could not e-mail the developer');
  }

  return feedback;
};

/** The type list and how to reach the developer. */
const meta = () => ({ types: FEEDBACK_TYPES, developer: DEVELOPER });

const listForUser = (userId) => feedbackRepo.listForUser(userId, RECENT_LIMIT);

module.exports = { submit, meta, listForUser };
