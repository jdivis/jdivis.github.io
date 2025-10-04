const FitResponseSchema = {
  type: 'object',
  required: ['summary', 'fitScore', 'keyReasons', 'suggestedFollowUps'],
  properties: {
    summary: { type: 'string', minLength: 3, maxLength: 280 },
    fitScore: { type: 'integer', minimum: 0, maximum: 100 },
    keyReasons: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 5,
    },
    suggestedFollowUps: {
      type: 'array',
      items: { type: 'string' },
      minItems: 2,
      maxItems: 4,
    },
  },
  additionalProperties: false,
};

module.exports = {
  FitResponseSchema,
};
