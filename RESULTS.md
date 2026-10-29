# SkyPulse — Final Results (Team 11)

Dataset: Kaggle Airline Passenger Satisfaction, 129,880 passengers, 22 features. Stratified 80/20 split (random_state=42): 103,904 train / 25,976 test.
Overall satisfied rate: 43.5%. Missing arrival delay values: 393 (filled with train median 0).

## Model comparison (test set)

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC | Fit time (s) | Tuning time (s) |
|---|---|---|---|---|---|---|---|
| Logistic Regression | 0.8745 | 0.8704 | 0.8355 | 0.8526 | 0.9283 | 0.06 | 4.32 |
| SVM (RBF) | 0.9465 | 0.9482 | 0.9274 | 0.9377 | 0.9865 | 18.72 | 2.99 |
| Random Forest **(best F1)** | 0.9637 | 0.9728 | 0.9428 | 0.9576 | 0.9947 | 3.29 | 14.99 |
| XGBoost *(served in app)* | 0.9634 | 0.9725 | 0.9423 | 0.9572 | 0.9954 | 1.14 | 29.63 |
| Booking-time XGBoost (6 features) | 0.8000 | 0.7726 | 0.7649 | 0.7687 | 0.8612 | 0.56 | — |

Notes:
- **SVM (RBF):** Trained on a 20,000-row stratified subsample (tuned on 10,000) because RBF SVM is slow on 100k+ rows
- **Random Forest:** Hyper-parameters searched on a 30,000-row subsample, final model fit on full training set
- **XGBoost:** Monotonic constraint: delay features can only lower satisfaction
- **Booking-time XGBoost (6 features):** Uses only the 6 features known at booking time (no service ratings, no delays)
- **Served model (XGBoost):** F1 within 0.1 pp of the best model, delay effect is monotonic (a longer delay never raises satisfaction) and exact TreeSHAP is fast.

## Best hyper-parameters (RandomizedSearchCV, 3-fold, scoring = F1)

- Logistic Regression: `{'C': 0.98467}`
- SVM (RBF): `{'C': 8.73191, 'gamma': 0.0455}`
- Random Forest: `{'max_depth': 30, 'max_features': 0.5, 'min_samples_leaf': 1, 'n_estimators': 170}`
- XGBoost: `{'colsample_bytree': 0.6624, 'learning_rate': 0.0487, 'max_depth': 7, 'n_estimators': 387, 'subsample': 0.8001}`

## Confusion matrices (rows actual, cols predicted; [[TN, FP], [FN, TP]])

- Logistic Regression: [[13286, 1404], [1856, 9430]]
- SVM (RBF): [[14118, 572], [819, 10467]]
- Random Forest: [[14393, 297], [646, 10640]]
- XGBoost: [[14389, 301], [651, 10635]]
- Booking-time XGBoost (6 features): [[12149, 2541], [2653, 8633]]

## Top 10 features by mean |SHAP| (XGBoost)

| Rank | Feature | Mean abs SHAP |
|---|---|---|
| 1 | Inflight wifi | 2.0556 |
| 2 | Type of travel | 1.6719 |
| 3 | Online boarding | 0.9960 |
| 4 | Customer type | 0.8036 |
| 5 | Class | 0.4151 |
| 6 | Baggage handling | 0.3626 |
| 7 | Check-in service | 0.3055 |
| 8 | Inflight service | 0.2858 |
| 9 | Seat comfort | 0.2756 |
| 10 | Age | 0.2619 |

## Passenger segments (K-Means, k = 6, silhouette {'4': 0.0973, '5': 0.1032, '6': 0.1115})

| # | Segment | Share | Satisfied | Avg age | Avg distance |
|---|---|---|---|---|---|
| 0 | Happy Long-Haul Travellers | 18.2% | 93.8% | 44 | 1847 mi |
| 1 | Unhappy Comfort Critics | 19.8% | 15.1% | 33 | 847 mi |
| 2 | Unhappy Holidaymakers | 17.2% | 10.6% | 38 | 754 mi |
| 3 | Unhappy Cabin Crew Critics | 17.0% | 26.0% | 47 | 1231 mi |
| 4 | Unhappy First-Time Flyers | 10.8% | 19.8% | 30 | 688 mi |
| 5 | Happy Wi-Fi Fans | 17.1% | 87.7% | 43 | 1603 mi |

## Fairness (XGBoost, test set)

| Attribute | Group | n | Accuracy | F1 |
|---|---|---|---|---|
| Gender | Female | 13,157 | 0.9635 | 0.9567 |
| Gender | Male | 12,819 | 0.9632 | 0.9576 |
| Age group | <25 | 4,872 | 0.9565 | 0.9201 |
| Age group | 25-40 | 7,815 | 0.9646 | 0.9535 |
| Age group | 40-60 | 10,863 | 0.9658 | 0.9699 |
| Age group | 60+ | 2,426 | 0.9621 | 0.9279 |

## Satisfaction by departure delay (whole dataset)

| Delay (min) | Passengers | Satisfied |
|---|---|---|
| 0 | 73,356 | 45.9% |
| 1-15 | 27,787 | 43.5% |
| 16-60 | 19,762 | 37.5% |
| 61-120 | 5,882 | 35.8% |
| 120+ | 3,093 | 35.9% |

Recovery action costs in the app are assumed values (configurable in `backend/engine.py`).
