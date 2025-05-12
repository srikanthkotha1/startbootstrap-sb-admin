import json
import pandas as pd
# import numpy as np
import sys
import logging
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
logger = logging.getLogger('MyLogger')
# Function to encode the features.
def encode_features(train_df,label_encoders=None):
    if label_encoders is None:
        label_encoders = {}
    cat_features = train_df.select_dtypes(include=['object']).columns
    for col in cat_features:
        le = LabelEncoder()
        train_df[col] = le.fit_transform(train_df[col])
        label_encoders[col]=le
    return train_df,label_encoders

def get_insights(api_params):
    dataset = api_params[0]
    try:
       df1 = pd.read_csv(dataset, encoding='latin1')
    except:
       try:
          df1 = pd.read_csv(dataset, encoding='iso-8859-1')
       except: 
          try:  
             df1 = pd.read_csv(dataset, encoding='cp1252')
          except:
             result="error"   
    result ={}
    total_rows = df1.shape[0]
    total_cols = df1.shape[1]
    df1_cat_cols = df1.select_dtypes(include=['object'])
    df1_num_cols = df1.select_dtypes(exclude=['object'])
    cat_cols = df1_cat_cols.columns.tolist()
    num_cols = df1_num_cols.columns.tolist()
    df2 = df1.fillna(0)
    all_cols = df2.columns.tolist()
    if api_params[1]=='Target_Cols':
      # logger.info("Inside Target_Cols filter condition")
      unique_dict={}
      for col in cat_cols:
         unique_dict[col] = df2[col].unique().tolist()
      result ={
         'Categorical_Columns':cat_cols,
         'unique_vals':unique_dict
      }
    elif api_params[2]=='Unique':
      unique_vals = df2[api_params[1]].unique().tolist()
      result={
         'Unique_Values':unique_vals
      }
    elif (api_params[1] =='Insights' or api_params[2] =='Insights' or api_params[2] =='Proceed'):   
      
      # logger.info("Inside Insights filter condition")
      cat_nuniques={}
      for col in cat_cols:
         cat_nuniques[col] = df2[col].nunique()
      num_nuniques={}
      for col in num_cols:
         num_nuniques[col] = df2[col].nunique()
      d2_nulls={}
      for col in df1.columns:
         d2_nulls[col] = '%.3f'%((df1[col].isnull().sum()/df1.shape[0])*100)
      tabl_desc = df2.describe().to_dict()
      all_data= df2.head(100).to_dict(orient='records')
      sample_data= df2.head().to_dict()
      if api_params[2] =='Proceed':
         if len(api_params) == 4:
            # try:
            test_df = pd.read_csv(api_params[3], encoding='latin1')
            # except:
            #    try:
            #       test_df = pd.read_csv(api_params[3], encoding='iso-8859-1')
            #    except: 
            #       try:  
            #          test_df = pd.read_csv(api_params[3], encoding='cp1252')
            #       except:
            #          result="error" 
            test_cols = test_df.columns.tolist()
            new_all_cols = all_cols.copy()
            new_all_cols.remove(api_params[1])
            
            if new_all_cols != test_cols:
               result ={
                  'Error': 'There is a mismatch in the columns of Test and Train datasets.'
               }
            else:   
               #---------------Below piece of code is to identify the columns to be dropped from the dataframe.
               cols_tobe_dropped =[]
               # From the numerical/categorical columns delete the columns that have more than half the size of 
               # unique columns greater than the total count of records.
               for col in num_cols:
                  if num_nuniques[col] >= df2.shape[0]/2:
                     cols_tobe_dropped.append(col)
               for col in cat_cols:
                  if cat_nuniques[col] >= df2.shape[0]/2:
                     cols_tobe_dropped.append(col)      
               # Identify the columns that have more than 45% of NaN values.
               for col in d2_nulls:
                  if float(d2_nulls[col]) >45.0:
                     cols_tobe_dropped.append(col)      
               # ---- Drop the columns that are not required.
               for col in cols_tobe_dropped:
                  df1.drop(col,axis=1,inplace=True)
                  test_df.drop(col,axis=1,inplace=True)
               # ----- Initialize the nan values.
               for col in num_cols:
                  if col not in cols_tobe_dropped:
                     df1[col].fillna(df1[col].median(),inplace=True)
                     test_df[col].fillna(test_df[col].median(),inplace=True)
               for col in cat_cols:
                  if col not in cols_tobe_dropped and col !=api_params[1]:
                     df1[col].fillna(df1[col].mode()[0],inplace=True)      
                     test_df[col].fillna(test_df[col].mode()[0],inplace=True)      
               
               df,label_encoders = encode_features(df1)
               test,_ = encode_features(test_df,label_encoders)
               
               #-----------------Model the data    
               # Extract the target column
               y = df[api_params[1]]
               x = df.drop(api_params[1],axis=1)
               X_train,X_test,y_train,y_test = train_test_split(x,y,test_size=0.2,random_state=42)
               model=RandomForestClassifier(random_state=42)
               model.fit(X_train,y_train)
               y_pred = model.predict(X_test)
               report=classification_report(y_test, y_pred) 
               result={
                  'Report':report
               } 

      if api_params[1] =='Insights':   
         result ={
            'Total_Columns':total_cols,
            'Total_Rows':total_rows,
            'Categorical_Columns':cat_cols,
            'Numercal_Columns':num_cols,
            'Describe_Table':tabl_desc ,
            'Cat_Nuniques':cat_nuniques,
            'Num_Nuniques':num_nuniques,
            'Null_Perecents':d2_nulls,
            'All_Data':all_data,
            'Sample_Data':sample_data,
            'allColumns':all_cols
      }
    #print(json.dumps(result))
    return result

if __name__ == '__main__':
   api_params = sys.argv[1].split(',') 
   # Configure logging
   logger.setLevel(logging.DEBUG)
   # Create handlers
   console_handler = logging.StreamHandler(sys.stdout)  # For console output
   # Set level for handlers
   console_handler.setLevel(logging.DEBUG)
   # Create formatter and add it to handlers
   formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
   console_handler.setFormatter(formatter)
   # Add handlers to the logger
   logger.addHandler(console_handler)
   insights=get_insights(api_params)

   print(json.dumps(insights))