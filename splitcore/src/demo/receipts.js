// Fictional sample receipt TEXT. These are inputs, never parsed results.
// The "Scan sample image" path sends the rendered PNG bytes through real OCR;
// the "Use sample text" path sends this text through the same parser.

export const SAMPLE_A = `Chick-fil-A
FICTIONAL TEST RECEIPT
NOT VALID FOR PAYMENT OR REWARDS
DATE 10/24/2026  TIME 18:30
STORE DEMO-000
ORDER DEMO-101

2 SANDWICH                  12.00
1 NUGGETS                    8.00
1 FRIES                      4.80
2 DRINK                      3.20
BILL DISCOUNT               -2.80
SUBTOTAL                    25.20
SALES TAX                    2.08
SERVICE CHARGE               1.26
TOTAL                       28.54

SAMPLE ONLY - DO NOT SUBMIT`;

export const SAMPLE_B = `SPLITCORE CAFE
FICTIONAL TEST RECEIPT
NOT VALID FOR PAYMENT OR REWARDS
DATE 10/24/2026

2 PIZZA                     20.00
1 SALAD                     10.00
PIZZA DISCOUNT              -4.00
BILL DISCOUNT               -2.60
SUBTOTAL                    23.40
TAX                          1.93
TOTAL                       25.33`;

export const SAMPLE_C = `PENNY DINER
FICTIONAL TEST RECEIPT
NOT VALID FOR PAYMENT OR REWARDS

1 SHARED PLATE              10.01
SUBTOTAL                    10.01
TOTAL                       10.01`;

export const SAMPLES = [
  { id: 'a', title: 'Dinner for three', detail: 'Bill discount, tax, service charge', image: 'demo/sample-a.png', text: SAMPLE_A },
  { id: 'b', title: 'Pizza with savings', detail: 'Item discount and bill discount', image: 'demo/sample-b.png', text: SAMPLE_B },
  { id: 'c', title: 'Shared plate', detail: 'Penny rounding', image: 'demo/sample-c.png', text: SAMPLE_C },
];

export const DEMO_DINERS = ['Maya', 'Jordan', 'Sam'];
