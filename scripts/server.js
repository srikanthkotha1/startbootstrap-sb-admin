const express = require("express");
const multer = require("multer");
const AWS = require("aws-sdk");
require("aws-sdk/lib/maintenance_mode_message").suppress = true;
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const NodeCache = require("node-cache");
const { table } = require("console");
// const { OpenAIApi, Configuration } = require("openai");
const OpenAIApi = require("openai");
const app = express();
app.use(express.json());
app.use(
    cors({
        origin: true,
    })
);
const openai = new OpenAIApi({
    apiKey: "", // Store your API key securely
});

// Configure AWS SDK
AWS.config.update({
    accessKeyId: "", // Replace with your access key
    secretAccessKey: "", // Replace with your secret key
    region: "us-east-1", // Replace with your S3 bucket region
});

const s3 = new AWS.S3();
// Create a DynamoDB document client
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const cache = new NodeCache({ stdTTL: 600 }); // Cache with a TTL of 10 minutes
// Multer setup for file upload handling
const upload = multer({ dest: "uploads/" }); // 'uploads/' is a temp folder
let train_file_sts=''
let test_file_sts=''
let upload_sts=''
// Wrap s3.upload in a promise-based function
function uploadToS3(params) {
    return new Promise((resolve, reject) => {
        s3.upload(params, (err, data) => {
            if (err) {
                console.error("Error uploading Training Dataset to S3:", err);
                reject(err);  // Reject promise if there's an error
                upload_sts="Error"
            } else {
                console.log(`Training Dataset uploaded successfully at ${data.Location}`);
                resolve(data);  // Resolve promise if upload is successful
                upload_sts='Success'
            }
        });
    });
}
// Delete dataset from workspace table
app.post("/removeFromworkspace", async (req, res) => {
    // console.log("Request.body:",req.body.dataset)
    const dataSetName = req.body.dataset
    // console.log("The dataset name:",dataSetName)
    // Params for Dyanmodb Table
    const dyanmo_params ={
        TableName: 'work_space_datasets',
        Key:{
            dataset: dataSetName
        }
    } 
    try {
        const result = await dynamoDB.delete(dyanmo_params).promise();
        res.status(200).send("Dataset removed from workspace table successfully.");
    } catch (error) {
        res.status(500).send("Error removing dataset from workspace.");
    }   
})

// Add the dataset to workspace table
app.post("/addtoworkspace", async (req, res) => {
    // console.log("Request.body:",req.body.dataset)
    const dataSetName = req.body.dataset
    // console.log("The dataset name:",dataSetName)
    // Params for Dyanmodb Table
    const dyanmo_params ={
        TableName: 'work_space_datasets',
        Item:{
            dataset: dataSetName
        }
    } 
    try {
        const result = await dynamoDB.put(dyanmo_params).promise();
        // console.log("Record inserted successfully:", result);
        res.status(200).send("Dataset added to workspace table successfully.");
    } catch (error) {
        // console.error("Error inserting record:", error);
        res.status(500).send("Error adding dataset to workspace.");
    }   
})
// Define route to accept multiple fields
    app.post("/upload", upload.fields([
        { name: 'fileUpload', maxCount: 1 },
        { name: 'testFileUpload', maxCount: 1 },
        { name: 'file', maxCount: 1 }
    ]), async (req, res) => {
// Endpoint to handle file upload
    // Access text fields
    const probTypeOption = req.body.prob_type_option;
    const tgtCol = req.body.tgt_col;
    const availTestOption = req.body.availTest_option;

    // Access files
    const fileUpload = req.files['fileUpload'] ? req.files['fileUpload'][0] : null;
    const testFileUpload = req.files['testFileUpload'] ? req.files['testFileUpload'][0] : null;
    
    const fileStream = fs.createReadStream(fileUpload.path);
    // Params for train file 
    const params = {
        Bucket: "explore-data-source/source/train", // Replace with your S3 bucket name
        Key: path.basename(fileUpload.originalname), // The file name on S3
        Body: fileStream,
        ContentType: fileUpload.mimetype,
    };
    const train_dataset = `s3://explore-data-source/source/train/${fileUpload.originalname}`;
    const datetimestamp = new Date().toISOString();
    let test_dataset =''
    if (testFileUpload!=null){
        test_dataset = `s3://explore-data-source/source/test/${testFileUpload.originalname}`;
    }
    // Params for Dyanmodb Table
    const dyanmo_params ={
        TableName: 'formdata',
        Item:{
            dataset: train_dataset,
            datetimestamp:datetimestamp,
            value:{
                problem_type:probTypeOption,
                target_col:tgtCol,
                is_test_dataset_avail:availTestOption,
                test_dataset:test_dataset
            }
        }
    }

    const upload_data = await uploadToS3(params);
    train_file_sts = upload_sts 
    if (testFileUpload!=null){
        // Params for test file 
        const testFileUploadStrm = fs.createReadStream(testFileUpload.path);
        const test_params = {
            Bucket: "explore-data-source/source/test", // Replace with your S3 bucket name
            Key: path.basename(testFileUpload.originalname), // The file name on S3
            Body: testFileUploadStrm,
            ContentType: testFileUpload.mimetype,
        };
        // Upload the file to S3
        const upload_data = await uploadToS3(test_params);
        test_file_sts = upload_sts 
        if (train_file_sts=='Success' && test_file_sts=='Success' ){
            res.status(200).send("Test and Train File uploaded successfully.");
            try {
                const result = await dynamoDB.put(dyanmo_params).promise();
                console.log("Record inserted successfully:", result);
            } catch (error) {
                console.error("Error inserting record:", error);
            }
        }else if (train_file_sts=='Error' && test_file_sts=='Error' ){
            res.status(500).send("Error uploading test and train file to S3");
        }else if (train_file_sts=='Error' && test_file_sts=='Success' ){
            res.status(400).send("Test file uploaded successfully. Error uploading train file");
        }else if (train_file_sts=='Error' && test_file_sts=='Success' ){
            res.status(400).send("Train file uploaded successfully. Error uploading test file");
        }
    }
    else{
        if (train_file_sts=='Success'){
            console.log("Success")
            try {
                const result = await dynamoDB.put(dyanmo_params).promise();
                console.log("Record inserted successfully:", result);
            } catch (error) {
                console.error("Error inserting record:", error);
            }
            res.status(200).send("Train File uploaded successfully.");
        }else{
            console.log("Failure, sts:",train_file_sts)
            res.status(500).send("Error uploading the training dataset.");
        }
        
    };
    
});
app.get("/getWSDatasets", async (req, res) => {
    tableName= 'work_space_datasets'
     // Function to read all items from a table
    const readAllItems = async (tableName) => {
        const params = {
            TableName: tableName,
        };

        try {
            let items = [];
            let data;
            
            do {
                data = await dynamoDB.scan(params).promise();
                items = items.concat(data.Items);

                // If LastEvaluatedKey is set, continue scanning
                params.ExclusiveStartKey = data.LastEvaluatedKey;
            } while (data.LastEvaluatedKey);

            return items;
        } catch (error) {
            console.error('Error reading items from DynamoDB:', error);
            throw error;
        }
    };
    const items = await readAllItems(tableName);
    res.status(200).send(items)
});
app.post("/uploadTest", upload.single("file"), (req, res) => {
    const file = req.file;
    const fileStream = fs.createReadStream(file.path);

    const params = {
        Bucket: "explore-data-source/source/test", // Replace with your S3 bucket name
        Key: path.basename(file.originalname), // The file name on S3
        Body: fileStream,
        ContentType: file.mimetype,
    };

    // Upload the file to S3
    s3.upload(params, (err, data) => {
        if (err) {
            console.error("Error uploading to S3:", err);
            res.status(500).send("Error uploading to S3");
        } else {
            console.log(`File uploaded successfully at ${data.Location}`);
            res.status(200).send(
                `File uploaded successfully. File URL: ${data.Location}`
            );
        }
        // Remove the file from local after upload
        fs.unlink(file.path, (err) => {
            if (err) console.error("Error deleting local file:", err);
        });
    });
});
app.get("/getDatasets", async (req, res) => {
    const TrainParams = {
        Bucket: "explore-data-source",
        Prefix: "source/",
    };
    const TestParams = {
        Bucket: "explore-data-source",
        Prefix: "source/test/",
    };
    try {
        const TrainData = await s3.listObjectsV2(TrainParams).promise();
        const TestData = await s3.listObjectsV2(TestParams).promise();
        // Extract only the object names from the full path
        // console.log("TrainData:",TrainData.Contents)
        const TrainfileNames = TrainData.Contents.map(
            (file) => file.Key+'~'+file.LastModified+'~'+file.Size
            // (LastModified) => file.LastModified
            // (file) => file.Key.split("/").slice(-1)[0]
        );
        const TestfileNames = TestData.Contents.map(
            (file) => file.Key+'~'+file.LastModified+'~'+file.Size
            // (file) => file.Key.split("/").slice(-1)[0]
        );
        // console.log('TrainfileNames:',TrainfileNames)
        // console.log('TestfileNames:',TestfileNames)
        res.status(200).json({
            trainFiles: TrainfileNames,
            testFiles: TestfileNames,
        });
    } catch (error) {
        console.error("Error fetching objects in s3 buckets", error);
        res.status(500).json({
            error: "Error fetching the files from s3 bucket",
        });
    }
});
// Below block of code is to get NLPInsights endpoint request
app.get("/getNLPInsights", async (req, res) => {
    // console.log("req.queryString.message:",req.query.message)
    const message = req.query.message
    const parsedMessage = JSON.parse(decodeURIComponent(message));
    // console.log("parsedMessage:",parsedMessage)
    // let msg1 = [{"role": "system", "content":"Tell me a joke."}]
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: parsedMessage
        });
        console.log("response.choices[0].message.content:",response.choices[0].message.content)
        res.status(200).send(response.choices[0].message.content);
    } catch (error) {
        console.error("Error generating text:", error);
    }
})
// Below block of code is to handle MLInsights endpoint request
app.get("/getMLInsights", async (req, res) => {
    const datasetName = req.query.dataset;
    console.log('datasetName:',datasetName)
    const dynamodb = new AWS.DynamoDB.DocumentClient();
    const params = {
        TableName: 'ml_insights',
        KeyConditionExpression: 'dataset = :ds',
        ExpressionAttributeValues: {
          ':ds': datasetName,
        }, 
        ScanIndexForward: false,
        Limit: 1,
        // Key: {'dataset':datasetName}, 
      };
    data = await dynamodb.query(params).promise();
    // items = table.get_item(Key={'PartitionKey': datasetName})
    res.status(200).send(data)
})
app.get("/getInsights", async (req, res) => {
    const datasetName = req.query.file;

    // Import Node-Cache - for caching the results.

    const cacheKey = JSON.stringify(req.query); // Use request parameters as cache key
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
        console.log("---------------Inside is cachedData-----------------");
        res.status(200).json({ results: cachedData });
        return;
    }
    const params = {
        Bucket: "explore-data-source",
        Train_Prefix: "source/train",
        Test_Prefix: "source/test",
    };
    const full_qualified_dataset =
        "s3://" + params.Bucket + "/" + params.Train_Prefix + "/" + datasetName;
    const test_datasetName = datasetName.split("_")[0] + "_test.csv";
    const full_qualified_test_dataset =
        "s3://" +
        params.Bucket +
        "/" +
        params.Test_Prefix +
        "/" +
        test_datasetName;
    try {
        const { spawn } = require("child_process");
        const pythonProcess = spawn("python", [
            "-u",
            "scripts/data_insights.py",
            [
                full_qualified_dataset,
                req.query.query1,
                req.query.query2,
                full_qualified_test_dataset,
            ],
        ]);

        pythonProcess.stdout.on("data", (data) => {
            try {
                const stringified_data = data.toString();
                // console.log(data.toString());
                cache.set(cacheKey, stringified_data); // Store result in cache
                // res.json(data);
                res.status(200).json({ results: stringified_data });
                return;
            } catch (error) {
                console.error("Error parsing JSON:", error);
            }
        });

        pythonProcess.stderr.on("data", (data) => {
            console.error(`Python Error: ${data.toString()}`);
        });

        pythonProcess.on("close", (code) => {
            console.log(`Python process exited with code ${code}`);
        });
    } catch (error) {
        console.error("Eror calling the python");
    }
});
// Define the route for "/"
app.get("/", (req, res) => {
    res.send("Hello World! This is the root page.");
});
// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
