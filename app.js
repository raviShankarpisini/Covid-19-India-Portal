const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dataBasePath = path.join(__dirname, "covid19IndiaPortal.db");
const app = express();

app.use(express.json());
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dataBasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server running at https://localhost:3000/");
    });
  } catch (error) {
    console.log(`error message is ${error.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const convertStateDbToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};
const convertDistrictDbToResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

// authentication
function authenticationToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
}

// api 1
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserInDbQuery = `SELECT * FROM user WHERE username='${username}';`;
  const checkUserInDb = await db.get(checkUserInDbQuery);
  if (checkUserInDb === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const comparingPassword = await bcrypt.compare(
      password,
      checkUserInDb.password
    );
    if (comparingPassword === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//api 2 get

app.get("/states/", authenticationToken, async (request, response) => {
  const statesQuery = `
      SELECT 
          *
      FROM
          state;`;
  const allStates = await db.all(statesQuery);
  response.send(
    allStates.map((eachState) => convertStateDbToResponseObject(eachState))
  );
});

app.get("/states/:stateId/", authenticationToken, async (request, response) => {
  const { stateId } = request.params;
  const stateQuery = `
      SELECT 
          *
      FROM
          state
      WHERE
          state_id=${stateId};`;
  const singleSate = await db.get(stateQuery);
  response.send(convertStateDbToResponseObject(singleSate));
});

app.get(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const singleDistrictQuery = `
      SELECT 
          *
      FROM
          district
      WHERE 
      district_id=${districtId};`;
    const singleDistrict = await db.get(singleDistrictQuery);
    response.send(convertDistrictDbToResponseObject(singleDistrict));
  }
);

app.post("/districts/", authenticationToken, async (request, response) => {
  const { stateId, districtName, cases, cured, active, deaths } = request.body;
  const postDistrictQuery = `
      INSERT INTO 
      district (state_id,district_name,cases,cured,active,deaths)
      VALUES
          (${stateId},'${districtName}',${cases},${cured},${active},${deaths});`;
  await db.run(postDistrictQuery);
  response.send("District Successfully Added");
});

app.delete(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteQuery = `
      DELETE 
      FROM
          district
      WHERE
          district_id=${districtId};`;
    await db.run(deleteQuery);
    response.send("District Removed");
  }
);
app.put(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;

    const updateDistrictQuery = `
      UPDATE 
          district
      SET
          district_name='${districtName}',
          state_id=${stateId},
          cases=${cases},
          cured=${cured},
          active=${active},
          deaths=${deaths}
      WHERE
          district_id=${districtId};
      `;
    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authenticationToken,
  async (request, response) => {
    const { stateId } = request.params;
    const statsQuery = `
      SELECT
          SUM(cases),
          SUM(cured),
          SUM(active),
          SUM(deaths)
      FROM
          district
      WHERE
          state_id=${stateId};`;
    const stats = await db.get(statsQuery);
    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);

module.exports = app;
