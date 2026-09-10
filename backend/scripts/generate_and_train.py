import os
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib

# Ensure output directory exists
MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'app', 'ml')
os.makedirs(MODEL_DIR, exist_ok=True)
MODEL_PATH = os.path.join(MODEL_DIR, 'aura_model_v1.pkl')

def generate_synthetic_dataset(num_samples=10000):
    np.random.seed(42)
    
    # 0 = Routine Industrial Activity
    # 1 = Accidental Industrial Fire / Explosion
    # 2 = Agricultural / Stubble Burning
    # 3 = Wildfire / Forest Fire
    
    # 0: Routine Industrial (40%)
    n_0 = int(num_samples * 0.4)
    df_0 = pd.DataFrame({
        'frp': np.random.uniform(0, 30, n_0),
        'bright_ti4': np.random.normal(310, 10, n_0),
        'bright_ti5': np.random.normal(300, 8, n_0),
        'spf': np.random.uniform(0.35, 1.0, n_0),
        'tai': np.random.normal(1.0, 0.5, n_0),
        'osm_industrial': 1,
        'target': 0
    })
    
    # 1: Accidental Industrial Fire (20%)
    n_1 = int(num_samples * 0.2)
    df_1 = pd.DataFrame({
        'frp': np.random.uniform(60, 250, n_1),
        'bright_ti4': np.random.normal(360, 15, n_1),
        'bright_ti5': np.random.normal(310, 10, n_1),
        'spf': np.random.uniform(0, 0.3, n_1), 
        'tai': np.random.normal(3.5, 0.8, n_1),
        'osm_industrial': 1,
        'target': 1
    })
    
    # 2: Agricultural (20%)
    n_2 = int(num_samples * 0.2)
    df_2 = pd.DataFrame({
        'frp': np.random.uniform(5, 55, n_2),
        'bright_ti4': np.random.normal(320, 10, n_2),
        'bright_ti5': np.random.normal(315, 8, n_2),
        'spf': np.random.uniform(0, 0.05, n_2),
        'tai': np.random.normal(1.5, 0.5, n_2),
        'osm_industrial': 0,
        'target': 2
    })
    
    # 3: Wildfire (20%)
    n_3 = int(num_samples * 0.2)
    df_3 = pd.DataFrame({
        'frp': np.random.uniform(65, 400, n_3),
        'bright_ti4': np.random.normal(350, 20, n_3),
        'bright_ti5': np.random.normal(320, 15, n_3),
        'spf': np.random.uniform(0, 0.1, n_3),
        'tai': np.random.normal(2.5, 1.0, n_3),
        'osm_industrial': 0,
        'target': 3
    })
    
    df = pd.concat([df_0, df_1, df_2, df_3], ignore_index=True)
    
    # Add calculated delta_brightness feature since pipeline extracts it
    df['delta_brightness'] = df['bright_ti4'] - df['bright_ti5']
    
    return df

def train_model():
    print("1. Generating synthetic telemetry dataset (10,000 records)...")
    df = generate_synthetic_dataset(10000)
    
    # Reorder features to match extract_features_from_telemetry order
    features = ['frp', 'bright_ti4', 'bright_ti5', 'delta_brightness', 'spf', 'tai', 'osm_industrial']
    X = df[features]
    y = df['target']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print("2. Training RandomForestClassifier...")
    clf = RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42)
    clf.fit(X_train, y_train)
    
    print("3. Evaluating model performance...")
    y_pred = clf.predict(X_test)
    print(classification_report(y_test, y_pred, target_names=["CLASS 0", "CLASS 1", "CLASS 2", "CLASS 3"]))
    
    print(f"4. Saving model to {MODEL_PATH}")
    joblib.dump(clf, MODEL_PATH)
    print("Done!")

if __name__ == "__main__":
    train_model()
