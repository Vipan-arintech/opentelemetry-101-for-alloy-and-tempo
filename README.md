# Observability in Cloud Native apps using OpenTelemetry

Welcome to the Observability in Cloud Native apps using OpenTelemetry
 repository! This repository contains a demo application that is being used throughout the Udemy course. Whether you're a beginner or an experienced developer, the demo application will help you learn and understand the fundamentals of OpenTelemetry and Observability.


## Following the course code examples
This course is build an a way that we start with a simple application and every section of the course we will add more functionally of OpenTelemetry. 

To navigate between the different phases of the course I have used git tags. Below is a table with all the available tags (after you have cloned the repo it is recommended to checkout the first tag)

| Deprecated tag | New tag  | Description |
| ------------- | ------------- | ------------- |
| 1 | 1 | Before we install OpenTelemetry  |
| 2 | 2 | Basic OpenTelemetry installation  |
| 3 | 3 | Adding Metrics  |
| 4 | 4 | Correlating logs with traces  |
| 5 | 5 | Creating manual spans  |
| 6 | 6 | Adding custom attributes  |
| 7 | 7 | Debug logs  |
| 8 | 8 | Define custom resources  |
| 9 | 9 | Configure custom sampler  |
| 10 | 10  | Using context propagation to set baggage  |
| 11 | 11-v2 | Using the OpenTelemetry Collector  |
| 12 | 12-v2 | Setting up tail sampling  |

## How to use this repo

1. **Clone the Repository:** 

```
git clone https://github.com/Vipan-arintech/opentelemetry-101-for-alloy-and-tempo.git
```

2. **Install correct Yarn** 

```
# Remove any existing npm-based yarn installation
npm uninstall -g yarn

# Install Yarn through official method
curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
sudo apt update && sudo apt install yarn
```

3. **Running it with docker-compose:** 
```
yarn install

docker-compose up -d

```

