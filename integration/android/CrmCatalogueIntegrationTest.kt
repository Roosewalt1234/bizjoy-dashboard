package com.eva.secretary
import androidx.test.platform.app.InstrumentationRegistry
import com.eva.secretary.ai.cloud.EvaCloudSession
import com.eva.secretary.ai.cloud.EvaCloudConfig
import com.eva.secretary.ai.chatgpt.*
import com.eva.secretary.voice.UserUtterance
import kotlinx.coroutines.*
import okhttp3.*
import org.json.*
import org.junit.Test
import org.junit.Assert.*
import java.io.File
class CrmCatalogueIntegrationTest {
 @Test fun existingCrmSessionIsValid() {
  val app=InstrumentationRegistry.getInstrumentation().targetContext
  val session=EvaCloudSession(app)
  assertTrue("Existing CRM account sign-in is required",session.configured())
  val request=Request.Builder().url(EvaCloudConfig.BASE_URL+"/auth/v1/user").header("apikey",EvaCloudConfig.PUBLISHABLE_KEY).header("Authorization","Bearer "+session.accessToken()).build()
  OkHttpClient().newCall(request).execute().use { response -> assertTrue("CRM account must validate",response.isSuccessful);println("EVA_CRM account_valid=true") }
 }
 @Test fun liveCatalogueAcceptance()=runBlocking {
  val app=InstrumentationRegistry.getInstrumentation().targetContext
  val args=InstrumentationRegistry.getArguments()
  val tools=DirectPhoneTools(app);val previous=tools.catalogueEnabled();tools.setCatalogueEnabled(true)
  try {
   val tool=args.getString("crmTool","crm_catalogue")
   val parameters=JSONObject(args.getString("crmArgs","{\"module\":\"\"}"))
   val result=tools.execute(tool,parameters)
   println("EVA_CRM_RESULT "+result.toString())
   assertTrue("Live CRM tool must succeed: "+result.optString("error"),result.optBoolean("success"))
  } finally {tools.setCatalogueEnabled(previous)}
 }
 @Test fun installedConversationAcceptance()=runBlocking {
  val app=InstrumentationRegistry.getInstrumentation().targetContext
  val args=InstrumentationRegistry.getArguments()
  val account=ChatGptPlanAccount.get(app);val tools=account.directTools as DirectPhoneTools
  val previous=tools.catalogueEnabled();tools.setCatalogueEnabled(true)
  val report=File(app.cacheDir,"eva-crm-conversations.jsonl");report.writeText("")
  try {
   val evidence=mutableListOf<JSONObject>()
   val tracking=object:EvaDirectTools {
    override fun definitions()=tools.definitions()
    override fun catalogueEnabled()=tools.catalogueEnabled()
    override fun cancelActive()=tools.cancelActive()
    override fun newConversation()=tools.newConversation()
    override suspend fun execute(name:String,arguments:JSONObject):JSONObject {
     val result=tools.execute(name,arguments)
     evidence.add(JSONObject().put("tool",name).put("success",result.optBoolean("success")).put("source",result.optString("source")).put("error",result.optString("error")).put("arguments",arguments))
     return result
    }
   }
   val client=ChatGptPlanClient(account,tools=tracking);client.newConversation()
   for(question in args.getString("questions","What are the latest three CRM quotations? List their quotation numbers.").split("||")) {
    evidence.clear();val start=System.currentTimeMillis();var first=0L
    val response=client.stream(UserUtterance(question),{if(first==0L)first=System.currentTimeMillis()-start},{})
    val record=JSONObject().put("question",question).put("success",response.success).put("text",response.text).put("elapsedMs",System.currentTimeMillis()-start).put("firstTextMs",first).put("evidence",JSONArray(evidence))
    report.appendText(record.toString()+"\n")
    println("EVA_CRM_ANSWER "+record)
    assertTrue("Installed EVA conversation must succeed",response.success)
    assertTrue("A real caller-bound CRM query or selection must succeed",evidence.any { it.optBoolean("success") && it.optString("source")=="live_crm" && it.optString("tool") in setOf("crm_query","crm_select") })
   }
  } finally {tools.setCatalogueEnabled(previous)}
 }
 @Test fun allModulesHaveCallerBoundReads()=runBlocking {
  val app=InstrumentationRegistry.getInstrumentation().targetContext
  val tools=DirectPhoneTools(app);val previous=tools.catalogueEnabled();tools.setCatalogueEnabled(true)
  val session=EvaCloudSession(app);val report=JSONArray()
  try {
   val modules=tools.execute("crm_catalogue",JSONObject().put("module","")).getJSONArray("modules")
   for(i in 0 until modules.length()) {
    val module=modules.getJSONObject(i);val name=module.getString("id")
    if(!module.getBoolean("available")) {
     val denied=tools.execute("crm_catalogue",JSONObject().put("module",name))
     assertEquals("crm_denied",denied.optString("error"))
     report.put(JSONObject().put("module",name).put("status","permission_denied_verified"));continue
    }
    val schema=tools.execute("crm_catalogue",JSONObject().put("module",name));assertTrue(schema.optBoolean("success"))
    val table=module.getJSONArray("tables").getString(0)
    val plan=JSONObject().put("steps",JSONArray().put(JSONObject().put("table",table).put("fields",JSONArray().put("id")).put("filters",JSONArray()).put("mode","count").put("limit",1)))
    val start=System.currentTimeMillis()
    val result=tools.execute("crm_query",JSONObject().put("plan_json",plan.toString()))
    assertTrue("Module "+name+" "+result.optString("error"),result.optBoolean("success"))
    val count=result.getJSONArray("results").getJSONObject(0).getInt("total")
    val request=Request.Builder().url(EvaCloudConfig.BASE_URL+"/rest/v1/"+table+"?select=id&limit=1")
     .header("apikey",EvaCloudConfig.PUBLISHABLE_KEY).header("Authorization","Bearer "+session.accessToken()).header("Prefer","count=exact").build()
    OkHttpClient().newCall(request).execute().use { response ->
     assertTrue(response.isSuccessful)
     assertEquals("Module count must match caller REST",count,response.header("Content-Range")!!.substringAfter('/').toInt())
    }
    report.put(JSONObject().put("module",name).put("table",table).put("status","live_executor_and_caller_rest_match").put("count",count).put("elapsedMs",System.currentTimeMillis()-start))
    File(app.cacheDir,"eva-crm-module-acceptance.json").writeText(report.toString(2))
   }
   assertEquals(28,report.length())
   println("EVA_CRM_MODULES 28 modules checked, including expected permission denial")
  } finally {tools.setCatalogueEnabled(previous);File(app.cacheDir,"eva-crm-module-acceptance.json").writeText(report.toString(2))}
 }
 @Test fun liveSafetyCases()=runBlocking {
  val app=InstrumentationRegistry.getInstrumentation().targetContext
  val tools=DirectPhoneTools(app);val previous=tools.catalogueEnabled();tools.setCatalogueEnabled(true)
  try {
   suspend fun query(table:String,field:String,value:String):JSONObject {
    val step=JSONObject().put("table",table).put("fields",JSONArray().put("id").put(field)).put("filters",JSONArray().put(JSONObject().put("field",field).put("op",if(field=="id")"eq" else "contains").put("value",value))).put("mode","rows").put("unique",true).put("limit",5)
    return tools.execute("crm_query",JSONObject().put("plan_json",JSONObject().put("steps",JSONArray().put(step)).toString()))
   }
   val ambiguous=query("contracts","title","Standard")
   assertTrue(ambiguous.optBoolean("success"));assertEquals("ambiguous",ambiguous.optString("status"))
   val empty=query("quotes","id","00000000-0000-4000-8000-000000000000")
   assertTrue(empty.optBoolean("success"));assertEquals("empty",empty.optString("status"))
   val denied=tools.execute("crm_catalogue",JSONObject().put("module","geofencing"))
   assertFalse(denied.optBoolean("success"));assertEquals("crm_denied",denied.optString("error"))
   val account=ChatGptPlanAccount.get(app);val client=ChatGptPlanClient(account,tools=tools)
   val work=async(Dispatchers.Default){client.stream(UserUtterance("How many CRM customers are there?"),{},{})}
   delay(250);client.cancelActive();val cancelled=work.await()
   assertFalse(cancelled.success);assertEquals("cancelled",cancelled.error)
   File(app.cacheDir,"eva-crm-live-safety.json").writeText(JSONObject().put("ambiguous_name","passed").put("empty_record","passed").put("missing_permission","passed").put("cancellation","passed").toString())
   println("EVA_CRM_SAFETY live ambiguity, empty result, permission denial, cancellation passed")
  } finally {tools.setCatalogueEnabled(previous)}
 }
 @Test fun liveBackendFailureHandled()=runBlocking {
  val app=InstrumentationRegistry.getInstrumentation().targetContext
  val tools=DirectPhoneTools(app);val previous=tools.catalogueEnabled();tools.setCatalogueEnabled(true)
  try {
   val result=tools.execute("crm_catalogue",JSONObject().put("module",""))
   assertFalse("Relay must be offline for this controlled-outage test",result.optBoolean("success"))
   assertTrue(result.optString("error").startsWith("business_connection_"))
   File(app.cacheDir,"eva-crm-outage.json").writeText(JSONObject().put("status","passed").put("error",result.optString("error")).toString())
  } finally {tools.setCatalogueEnabled(previous)}
 }
 @Test fun activateCatalogue() {
  DirectPhoneTools(InstrumentationRegistry.getInstrumentation().targetContext).setCatalogueEnabled(true)
  println("EVA_CRM catalogue_enabled=true")
 }
}
