const { body } = require('express-validator');
const { FEEDBACK_TYPES } = require('../../shared/constants');
const { unicodeText } = require('../../shared/validation/rules');

const feedbackValidators = {
  create: [
    unicodeText(
      body('message').exists({ checkFalsy: true }).withMessage('Tell us what is on your mind').bail(),
      { min: 5, max: 2000, message: 'Feedback must be 5-2000 characters' }
    ),
    body('type').optional().isIn(FEEDBACK_TYPES).withMessage('Unknown feedback type'),
    body('rating').optional({ nullable: true }).isInt({ min: 1, max: 5 }).toInt(),
    unicodeText(body('page').optional(), { max: 120 }),
  ],
};

module.exports = feedbackValidators;
