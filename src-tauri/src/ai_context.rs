//! Transparent bounded context selection for documents larger than a model request.
use std::collections::HashSet;
pub fn chunks(text:&str,size:usize)->Vec<String>{
    let mut result=Vec::new();let mut part=String::new();let mut count=0;
    for line in text.split_inclusive('\n'){for ch in line.chars(){part.push(ch);count+=1;if count>=size{result.push(std::mem::take(&mut part));count=0}}}
    if !part.is_empty(){result.push(part)}result
}
pub struct Context{pub text:String,pub used:usize,pub total:usize}
pub fn select(text:&str,question:&str,budget:usize)->Context{
    let size=6000.min(budget.saturating_sub(80).max(1));let parts=chunks(text,size);let total=parts.len();
    if text.chars().count()<=budget{return Context{text:text.into(),used:total,total}}
    let mut terms=HashSet::new();let query=question.to_lowercase();
    for word in query.split(|c:char|!c.is_alphanumeric()){if word.len()>1{terms.insert(word.to_string());}}
    let chars:Vec<_>=query.chars().filter(|c|('\u{4e00}'..='\u{9fff}').contains(c)).collect();for pair in chars.windows(2).take(80){terms.insert(pair.iter().collect::<String>());}
    let mut ranked:Vec<_>=parts.iter().enumerate().map(|(i,p)|{let lower=p.to_lowercase();(i,terms.iter().map(|t|lower.matches(t.as_str()).count().min(20)).sum::<usize>())}).collect();ranked.sort_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    let count=(budget/(size+40)).max(1).min(total);let summary=["总结","概括","梳理","summary"].iter().any(|s|query.contains(s));let mut selected=HashSet::new();
    if summary||ranked.first().is_some_and(|r|r.1==0){for i in 0..count{selected.insert(if count==1{0}else{i*(total-1)/(count-1)});}}else{for(i,_)in ranked.iter().take(count){selected.insert(*i);}}
    let mut ids:Vec<_>=selected.into_iter().collect();ids.sort();
    let text=ids.iter().map(|i|format!("[资料片段 {}/{}]\n{}",i+1,total,parts[*i])).collect::<Vec<_>>().join("\n\n").chars().take(budget).collect();Context{text,used:ids.len(),total}
}
