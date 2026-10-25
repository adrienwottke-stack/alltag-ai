"""Normalize and validate Cherri's unsigned output before public-only signing."""
import sys,plistlib,pathlib,re,hashlib,json,uuid
source,target=map(pathlib.Path,sys.argv[1:3])
p=plistlib.loads(source.read_bytes())
actions=p['WFWorkflowActions']
folder={'fileLocation':{'WFFileLocationType':'Shortcuts','relativeSubpath':'','appContainerBundleIdentifier':'com.apple.shortcuts'},'filename':'Documents','displayName':'Shortcuts'}
for index,action in enumerate(actions):
    name=action['WFWorkflowActionIdentifier'];args=action.setdefault('WFWorkflowActionParameters',{})
    args.setdefault('UUID',str(uuid.uuid5(uuid.NAMESPACE_URL,'alltag-shortcut-v1/action/'+str(index))))
    if name=='is.workflow.actions.base64encode':
        args.pop('input',None)
        args.update(WFEncodeMode='Encode',WFBase64LineBreakMode='None')
    if name=='is.workflow.actions.documentpicker.open':
        args.pop('WFFileStorageService',None)
        args.update(WFShowFilePicker=False,WFGetFolderContents=False,WFFile=folder,WFFileErrorIfNotFound=False)
    if name=='is.workflow.actions.documentpicker.save':
        args.pop('WFFileStorageService',None)
        args.update(WFFolder=folder,WFAskWhereToSave=False,WFSaveFileOverwrite=True)
    if name=='is.workflow.actions.ask':args['WFAllowsMultilineText']=False
    if name=='is.workflow.actions.downloadurl':
        assert args.get('WFHTTPMethod')=='POST'
        assert args.get('WFHTTPBodyType')=='JSON'
assert p['WFWorkflowTypes']==['ActionExtension']
assert set(p['WFWorkflowInputContentItemClasses'])=={'WFStringContentItem','WFImageContentItem','WFURLContentItem'}
assert not p['WFWorkflowImportQuestions']
allowed={'conditional','repeat.count','setvariable','nothing','gettext','exit','alert','downloadurl','number','openurl','text.replace','documentpicker.open','text.trimwhitespace','count','getitemfromlist','getitemtype','image.resize','image.convert','base64encode','dictionary','ask','documentpicker.save','getvalueforkey'}
assert all(a['WFWorkflowActionIdentifier'].removeprefix('is.workflow.actions.') in allowed for a in actions)
data=plistlib.dumps(p,fmt=plistlib.FMT_XML,sort_keys=False)
assert not re.search(rb'(?<![\w-])sk-[A-Za-z0-9_-]{15,}',data)
target.write_bytes(data)
print(json.dumps({'actions':len(actions),'minimumClient':p['WFWorkflowMinimumClientVersion'],'sha256':hashlib.sha256(data).hexdigest(),'publicTemplateOnly':True,'lineBreaks':'None','pickerDisabled':True}))
